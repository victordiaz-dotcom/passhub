import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SLACK_USERS_ENDPOINT = "https://eqktetnujlsrgqlklcjr.supabase.co/rest/v1/slack_users";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const slackApiKey = Deno.env.get("SLACK_USERS_API_KEY");
  const slackBotToken = Deno.env.get("SLACK_BOT_TOKEN");

  if (!slackApiKey) {
    return jsonResponse(
      { error: "Falta configurar el secreto SLACK_USERS_API_KEY en este proyecto de Supabase." },
      500
    );
  }

  // Cliente con el JWT de quien llama, solo para averiguar quién es.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user: caller },
  } = await callerClient.auth.getUser();

  if (!caller) {
    return jsonResponse({ error: "No autorizado." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // superadmin también puede sincronizar (igual que create-user/reset-user-password
  // /delete-user y el resto de RLS/funciones — ver migraciones 0042/0044).
  const { data: callerRoleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  const callerRoles = (callerRoleRows ?? []).map((r) => r.role);
  const callerIsAdmin = callerRoles.includes("admin") || callerRoles.includes("superadmin");

  if (!callerIsAdmin) {
    return jsonResponse({ error: "Solo un administrador puede sincronizar empleados." }, 403);
  }

  const { data: companies } = await adminClient.from("companies").select("id, name");
  if (!companies || companies.length === 0) {
    return jsonResponse({ error: "No hay empresas registradas en el sistema." }, 500);
  }

  // Fallback para cuando "organization" no matchea ninguna empresa conocida
  // (o viene vacío): se usa Tendencys Innovations, que es de donde viene
  // este directorio de Slack.
  const fallbackCompany =
    companies.find((c) => normalize(c.name) === normalize("Tendencys Innovations")) ?? companies[0];

  function resolveCompanyId(organization: unknown): string {
    if (typeof organization !== "string" || !organization.trim()) return fallbackCompany.id;
    const norm = normalize(organization);
    const match = companies!.find((c) => {
      const cn = normalize(c.name);
      return cn === norm || cn.includes(norm) || norm.includes(cn);
    });
    return match?.id ?? fallbackCompany.id;
  }

  let slackUsers: Array<Record<string, unknown>>;
  try {
    const res = await fetch(SLACK_USERS_ENDPOINT, {
      headers: {
        apikey: slackApiKey,
        Authorization: `Bearer ${slackApiKey}`,
      },
    });
    if (!res.ok) {
      return jsonResponse({ error: `El directorio de Slack respondió con error (${res.status}).` }, 502);
    }
    slackUsers = await res.json();
  } catch {
    return jsonResponse({ error: "No se pudo contactar el directorio de Slack." }, 502);
  }

  // El directorio de slack_users no trae correo; se obtiene aparte desde la
  // propia API de Slack (users.list, con el bot de notify-slack que ya tiene
  // los scopes users:read / users:read.email) para poder mandarle el DM de
  // aviso de visita al colaborador correcto. Si el bot no está configurado
  // todavía, la sincronización sigue funcionando, solo sin correos.
  const emailBySlackId = new Map<string, string>();
  if (slackBotToken) {
    try {
      // El bot está instalado como app de organización (Enterprise Grid /
      // multi-workspace), así que users.list exige team_id explícito o
      // responde "missing_argument". Se obtiene una vez con auth.test.
      let teamId: string | undefined;
      const authTestRes = await fetch("https://slack.com/api/auth.test", {
        method: "POST",
        headers: { Authorization: `Bearer ${slackBotToken}` },
      });
      const authTestData = await authTestRes.json();
      if (authTestData.ok) {
        teamId = authTestData.team_id;
      } else {
        console.error("Slack auth.test error:", authTestData);
      }

      let cursor = "";
      do {
        const params = new URLSearchParams({ limit: "200" });
        if (cursor) params.set("cursor", cursor);
        if (teamId) params.set("team_id", teamId);

        const res = await fetch(`https://slack.com/api/users.list?${params}`, {
          headers: { Authorization: `Bearer ${slackBotToken}` },
        });
        const data = await res.json();

        if (!data.ok) {
          console.error("Slack users.list error:", data);
          break;
        }

        for (const member of data.members ?? []) {
          if (member.id && member.profile?.email) {
            emailBySlackId.set(member.id, member.profile.email);
          }
        }

        cursor = data.response_metadata?.next_cursor ?? "";
      } while (cursor);
    } catch (err) {
      console.error("No se pudo obtener correos desde Slack users.list:", err);
    }
  }

  // Cuentas de puesto/rol genérico de Slack (ej. "Accounting Coordinator",
  // "Country Manager MX"), no personas reales — se excluyen por completo de
  // la sincronización (ni se crean ni se tocan si ya existían), así una
  // desactivación manual en el front no se deshace en la próxima corrida.
  const PLACEHOLDER_ROLE_NAME =
    /(coordinator|manager|administrator|director|specialist|assistant|supervisor|analyst|support|helpdesk|help desk|service desk|team|department|bot|system|admin|generic|shared|role|position|placeholder|test|sample|demo|noreply|no-reply|workflow|integration|automation)/i;

  // "TL <equipo/región>" (Team Lead) es una convención recurrente de puestos
  // genéricos en este directorio (ej. "TL SDR CO", "TL KAE BR") — se detecta
  // por patrón (anclado al inicio, nunca calzaría con el nombre real de una
  // persona) en vez de listar cada variante a mano. Ver migración 0031.
  const PLACEHOLDER_TEAM_LEAD_PREFIX = /^tl\s/i;

  // Nombres genéricos concretos (IA, puestos/roles departamentales, entornos
  // de desarrollo) revisados uno por uno — no calzan con ningún patrón de
  // arriba pero tampoco son personas reales. Ver migración 0027. A diferencia
  // de "TL ...", acrónimos como "CFO"/"GM Cargo"/"BDM BR" no tienen un prefijo
  // seguro de generalizar (podría chocar con el nombre real de alguien), así
  // que estos se siguen agregando uno por uno conforme aparecen.
  const PLACEHOLDER_EXACT_NAMES = new Set([
    "ai alex",
    "ai orion",
    "ai sofia",
    "bdm br",
    "bdm es",
    "bdm in",
    "bdm us",
    "cfo",
    "cfo ecart",
    "claims mx",
    "consultant lawyer europe",
    "consultant lawyer latam",
    "coo",
    "dev wms",
    "ff hr es",
    "financial planning",
    "fulfillment mty",
    "global partners",
    "gm cargo",
    "gm ff",
    "growth tendencys",
    "hr latam",
  ]);

  // Solo personas activas, con slack_id y real_name válidos, que no
  // parezcan una cuenta de puesto/rol genérico, y de México — el
  // directorio de Slack incluye personal de otros países (AR, CO, IN,
  // etc.), pero esta empresa solo quiere sincronizar/mostrar como
  // colaboradores a quienes tengan country = 'MX'.
  const validUsers = slackUsers.filter(
    (u) =>
      u.status === "active" &&
      typeof u.slack_id === "string" &&
      u.slack_id &&
      typeof u.real_name === "string" &&
      (u.real_name as string).trim() &&
      !PLACEHOLDER_ROLE_NAME.test((u.real_name as string).trim()) &&
      !PLACEHOLDER_TEAM_LEAD_PREFIX.test((u.real_name as string).trim()) &&
      !PLACEHOLDER_EXACT_NAMES.has((u.real_name as string).trim().toLowerCase()) &&
      u.country === "MX"
  );

  if (validUsers.length === 0) {
    return jsonResponse({ synced: 0, warning: "El directorio de Slack no devolvió personas activas válidas." });
  }

  // Diagnóstico: qué valores trae "organization" en el directorio, para
  // poder afinar el mapeo si algún nombre de empresa no calza.
  const orgValues = new Set(
    validUsers.map((u) => (typeof u.organization === "string" ? u.organization : "(vacío)"))
  );
  console.log("Valores de 'organization' en el directorio de Slack:", Array.from(orgValues));

  // Un batch de upsert usa la unión de llaves de todo el array: si una fila
  // sin correo resuelto llevara "email: null" mezclada con filas que sí
  // tienen correo, PostgREST igual generaría la columna para todas. Por eso
  // van en dos upserts separados, cada uno con un shape uniforme, así el
  // batch sin correos nunca toca esa columna para las filas que ya la
  // tenían de una sincronización anterior.
  const rowsWithEmail: Array<{
    slack_id: string;
    full_name: string;
    company_id: string;
    active: true;
    email: string;
    country: string | null;
  }> = [];
  const rowsWithoutEmail: Array<{
    slack_id: string;
    full_name: string;
    company_id: string;
    active: true;
    country: string | null;
  }> = [];

  for (const u of validUsers) {
    const slackId = u.slack_id as string;
    const full_name = (u.real_name as string).trim();
    const email = emailBySlackId.get(slackId);
    const company_id = resolveCompanyId(u.organization);
    const country = typeof u.country === "string" && u.country.trim() ? u.country.trim() : null;

    if (email) {
      rowsWithEmail.push({ slack_id: slackId, full_name, company_id, active: true, email, country });
    } else {
      rowsWithoutEmail.push({ slack_id: slackId, full_name, company_id, active: true, country });
    }
  }

  if (rowsWithEmail.length > 0) {
    const { error } = await adminClient.from("employees").upsert(rowsWithEmail, { onConflict: "slack_id" });
    if (error) {
      return jsonResponse({ error: `No se pudieron guardar los empleados: ${error.message}` }, 500);
    }
  }

  if (rowsWithoutEmail.length > 0) {
    const { error } = await adminClient.from("employees").upsert(rowsWithoutEmail, { onConflict: "slack_id" });
    if (error) {
      return jsonResponse({ error: `No se pudieron guardar los empleados: ${error.message}` }, 500);
    }
  }

  return jsonResponse({ synced: rowsWithEmail.length + rowsWithoutEmail.length, withEmail: rowsWithEmail.length });
});
