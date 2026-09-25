import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Permite el dominio real de producción y los orígenes de desarrollo local
// (donde corre "npm run dev") -- antes estaba fijo solo a producción, lo
// que rompía en silencio cualquier llamada a esta función al probar en
// local, porque el navegador bloquea la respuesta si el origen no calza
// exacto con Access-Control-Allow-Origin.
const ALLOWED_ORIGINS = new Set([
  "https://passhub.tendencys.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

// En passhub-dev (el proyecto de pruebas) esta lista fija no alcanza: se
// comparte con testers externos por un puerto abierto o un túnel cuya URL
// no es localhost ni el dominio de producción, así que su origen nunca
// coincide y el navegador bloqueaba la respuesta (síntoma real: un
// superadmin de prueba no podía crear cuentas, aunque su rol estuviera
// bien, porque la función nunca llegaba a responderle). Se detecta el
// proyecto por su propia URL (no por config manual) para que producción
// siga exactamente igual de estricta; la seguridad real de esta función
// sigue siendo el JWT + el chequeo de rol de abajo, no el origen.
const DEV_PROJECT_URL = "https://fzzdpktihplgzskvpxuq.supabase.co";
const IS_DEV_PROJECT = Deno.env.get("SUPABASE_URL") === DEV_PROJECT_URL;

function corsHeadersFor(origin: string | null) {
  const allowOrigin = IS_DEV_PROJECT
    ? origin ?? "*"
    : origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://passhub.tendencys.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// visitor_name/reason/division/visitor_company pueden venir tal cual del
// pre-registro público sin autenticar (un visitante los escribe libremente).
// Sin escapar, alguien podría meter "<!channel>", "<@USERID>" o un link
// falso "<https://evil|texto>" y que Slack lo interprete como mención/link
// real al mandarse el DM al colaborador. Regla oficial de Slack para texto
// de usuario dentro de mrkdwn: escapar &, < y > en ese orden.
function escapeSlackText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function slackGet(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function slackPost(url: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return res.json();
}

const MAX_BODY_BYTES = 100_000;

// Mirar solo el header content-length no protege nada: con
// "Transfer-Encoding: chunked" un cliente lo puede omitir por completo (o
// mentir), y aun así Deno intenta leer el body entero sin límite propio --
// probado en vivo, un body de unos MB sin content-length dejó una función
// pública de este mismo proyecto colgada más de dos minutos antes de que la
// plataforma la matara por su cuenta. Este helper sí impone un límite real
// cortando la lectura del stream apenas se pasa del máximo, sin importar lo
// que el cliente haya declarado.
async function readBodyWithLimit(req: Request, maxBytes: number): Promise<string> {
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

Deno.serve(async (req) => {
  // Cerrado sobre esta constante (no un corsHeaders global mutable): Deno
  // puede procesar requests concurrentes en el mismo aislado, y una
  // variable global reescrita en cada request tendría condición de carrera
  // entre respuestas de distinto origen.
  const corsHeaders = corsHeadersFor(req.headers.get("origin"));
  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "No autorizado." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const slackBotToken = Deno.env.get("SLACK_BOT_TOKEN");

  if (!slackBotToken) {
    console.error("Falta el secret SLACK_BOT_TOKEN.");
    return jsonResponse({ error: "Slack no está configurado en este proyecto." }, 500);
  }

  // Cliente con el JWT de quien llama: así la consulta de la visita respeta
  // las mismas políticas RLS que ya rigen para recepción/admin, sin
  // necesitar la service role key en esta función.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();

  if (!caller) {
    return jsonResponse({ error: "No autorizado." }, 401);
  }

  // Solo quien puede registrar/gestionar visitas debería disparar el
  // aviso de Slack -- sin este chequeo, cualquier cuenta con sesión (ej.
  // guardia, que solo tiene lectura de visitas "dentro" vía RLS) podía
  // volver a mandar el DM de "tu invitado llegó" para cualquier visita
  // que sí alcanza a ver, sin límite. Se usa la service role solo para
  // esta consulta de rol (igual que el resto de las funciones), la
  // consulta de la visita en sí sigue con el cliente del caller.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: callerRoleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  const callerCanNotify = (callerRoleRows ?? []).some(
    (r) => r.role === "admin" || r.role === "recepcion" || r.role === "superadmin"
  );

  if (!callerCanNotify) {
    return jsonResponse({ error: "No autorizado." }, 403);
  }

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, MAX_BODY_BYTES);
  } catch {
    return jsonResponse({ error: "Solicitud demasiado grande." }, 413);
  }

  let body: { visitId?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  if (!body.visitId) {
    return jsonResponse({ error: "Falta visitId." }, 400);
  }

  const { data: visit, error: visitError } = await callerClient
    .from("visits")
    .select(
      "folio, visitor_name, visitor_company, reason, division, check_in_at, employees(full_name, slack_id), companies(name)"
    )
    .eq("id", body.visitId)
    .maybeSingle();

  if (visitError || !visit) {
    console.error(visitError);
    return jsonResponse({ error: "No se encontró la visita." }, 404);
  }

  // Se usa el slack_id que ya trae el directorio de empleados (no el correo:
  // buscar por correo/listar usuarios requiere permisos de organización que
  // este bot no siempre tiene concedidos por workspace). Con el id ya
  // resuelto, abrir el DM es una operación directa sobre ese usuario.
  const slackUserId = visit.employees?.slack_id;
  if (!slackUserId) {
    return jsonResponse({ ok: true, skipped: "El colaborador no tiene slack_id (sincroniza empleados)." });
  }

  let openData = await slackPost("https://slack.com/api/conversations.open", slackBotToken, {
    users: slackUserId,
  });

  // Si el bot está instalado como app de organización, algunas llamadas
  // exigen team_id explícito — se reintenta una vez con el team_id del
  // propio bot antes de rendirse.
  if (!openData.ok && (openData.error === "missing_argument" || openData.error === "team_access_not_granted")) {
    const authTestData = await slackGet("https://slack.com/api/auth.test", slackBotToken);
    console.log("Slack auth.test:", authTestData);
    if (authTestData.ok && authTestData.team_id) {
      openData = await slackPost("https://slack.com/api/conversations.open", slackBotToken, {
        users: slackUserId,
        team_id: authTestData.team_id,
      });
    }
  }

  if (!openData.ok) {
    console.error("Slack conversations.open error:", openData, "slackUserId:", slackUserId);
    return jsonResponse({ ok: true, skipped: `No se pudo abrir el DM en Slack: ${openData.error}` });
  }

  const dmChannelId = openData.channel.id;

  const checkInTime = new Date(visit.check_in_at).toLocaleString("es-MX", {
    timeZone: "America/Monterrey",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const fields = [
    { type: "mrkdwn", text: `🧑 *Visitante:*\n${escapeSlackText(visit.visitor_name)}` },
    { type: "mrkdwn", text: `🏢 *Empresa:*\n${escapeSlackText(visit.companies?.name ?? "—")}` },
    { type: "mrkdwn", text: `🕐 *Hora de ingreso:*\n${checkInTime}` },
  ];

  if (visit.division) {
    fields.push({ type: "mrkdwn", text: `🧭 *División:*\n${escapeSlackText(visit.division)}` });
  }
  if (visit.reason) {
    fields.push({ type: "mrkdwn", text: `📝 *Motivo:*\n${escapeSlackText(visit.reason)}` });
  }
  if (visit.visitor_company) {
    fields.push({ type: "mrkdwn", text: `🪪 *Empresa visitante:*\n${escapeSlackText(visit.visitor_company)}` });
  }

  const blocks = [
    { type: "header", text: { type: "plain_text", text: "👋 Tu invitado ha llegado", emoji: true } },
    { type: "section", fields },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `📍 Recepción · PassHub · Folio ${visit.folio}` }],
    },
  ];

  // Se manda dentro de un attachment (no como "blocks" al nivel raíz) solo
  // para poder ponerle una franja de color a la izquierda con la marca —
  // Slack ya no deja hacer eso con bloques sueltos.
  const slackData = await slackPost("https://slack.com/api/chat.postMessage", slackBotToken, {
    channel: dmChannelId,
    // Este "text" es el fallback de notificación push (no mrkdwn real), pero
    // igual se escapa por consistencia y porque Slack lo muestra tal cual en
    // notificaciones/vistas previas.
    text: `${escapeSlackText(visit.visitor_name)} llegó a recepción de ${escapeSlackText(visit.companies?.name ?? "tu empresa")} (folio ${visit.folio})`,
    attachments: [{ color: "#1B3A5C", blocks }],
  });

  if (!slackData.ok) {
    console.error("Slack chat.postMessage error:", slackData);
    return jsonResponse({ ok: true, skipped: `Slack rechazó el mensaje: ${slackData.error}` });
  }

  return jsonResponse({ ok: true });
});
