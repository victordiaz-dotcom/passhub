import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  if (Number(req.headers.get("content-length") ?? 0) > 100_000) {
    return jsonResponse({ error: "Solicitud demasiado grande." }, 413);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "No autorizado." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

  let body: { visitId?: string };
  try {
    body = await req.json();
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
