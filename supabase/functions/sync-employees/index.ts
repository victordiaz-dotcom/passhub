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
  "http://localhost:8080",
  "http://127.0.0.1:8080",
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

const SLACK_USERS_ENDPOINT = "https://eqktetnujlsrgqlklcjr.supabase.co/rest/v1/slack_users";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
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

  if (Number(req.headers.get("content-length") ?? 0) > 100_000) {
    return jsonResponse({ error: "Solicitud demasiado grande." }, 413);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "No autorizado." }, 401);
  }

  const body = await req.json().catch(() => null);
  const requestedCountry = body?.country;
  if (requestedCountry !== "MX" && requestedCountry !== "ES") {
    return jsonResponse({ error: "Selecciona México o España para sincronizar." }, 400);
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
  const callerIsSuperadmin = callerRoles.includes("superadmin");

  if (!callerIsAdmin) {
    return jsonResponse({ error: "Solo un administrador puede sincronizar empleados." }, 403);
  }

  // Esta consulta (y la de rol de arriba) usan la service role, que ignora
  // RLS -- a diferencia de has_role() (que sí exige profiles.active), así
  // que sin este chequeo una cuenta desactivada con una sesión todavía
  // válida podía seguir usando esta función aunque ya no pudiera tocar
  // ninguna tabla directamente.
  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("active, office_id")
    .eq("id", caller.id)
    .single();

  if (!callerProfile?.active) {
    return jsonResponse({ error: "Tu cuenta está desactivada." }, 403);
  }

  // La función usa service role, así que valida aquí el país permitido:
  // un admin necesita oficina asignada del país que solicita. Superadmin
  // puede elegir cualquiera de los dos países desde botones separados.
  const callerOfficeId = callerIsSuperadmin ? null : callerProfile.office_id;
  if (!callerIsSuperadmin && !callerOfficeId) {
    return jsonResponse({ error: "Tu cuenta no tiene una oficina asignada." }, 403);
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

  const { data: offices } = await adminClient.from("offices").select("id, name, country");

  const targetOffice = offices?.find((office) => office.country === requestedCountry);
  if (!targetOffice) {
    return jsonResponse({ error: "No hay una oficina registrada para ese país." }, 400);
  }
  if (!callerIsSuperadmin && !offices?.some(
    (office) => office.id === callerOfficeId && office.country === requestedCountry
  )) {
    return jsonResponse({ error: "Solo puedes sincronizar colaboradores de tu país." }, 403);
  }

  // Francia e Italia se atienden desde la oficina de España. Conservamos
  // su country real para el filtro, pero les asignamos la oficina española
  // para que el admin de España los vea conforme a RLS.
  function resolveOfficeId(country: unknown): string | null {
    const countryCode = typeof country === "string" ? country.trim().toUpperCase() : "";
    if (!countryCode || !offices) return null;
    const officeCountry = countryCode === "FR" || countryCode === "IT" ? "ES" : countryCode;
    return offices.find((o) => o.country === officeCountry)?.id ?? null;
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

  // España incluye Francia e Italia, que comparten la oficina de Madrid.
  // México se sincroniza en una llamada independiente.
  const syncedCountries = new Set(
    requestedCountry === "ES" ? ["ES", "FR", "IT"] : ["MX"]
  );
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
      typeof u.country === "string" &&
      syncedCountries.has(u.country.trim().toUpperCase())
  );

  if (validUsers.length === 0) {
    return jsonResponse({ synced: 0, warning: "El directorio de Slack no devolvió personas activas válidas." });
  }

  // Restringimos también por oficina antes de construir cualquier upsert.
  const scopedUsers = callerOfficeId
    ? validUsers.filter((u) => resolveOfficeId(u.country) === callerOfficeId)
    : validUsers;

  if (scopedUsers.length === 0) {
    return jsonResponse({
      synced: 0,
      warning: "El directorio de Slack no tiene personas de ese país para sincronizar.",
    });
  }

  // Diagnóstico: qué valores trae "organization" en el directorio, para
  // poder afinar el mapeo si algún nombre de empresa no calza.
  const orgValues = new Set(
    scopedUsers.map((u) => (typeof u.organization === "string" ? u.organization : "(vacío)"))
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
    office_id: string | null;
  }> = [];
  const rowsWithoutEmail: Array<{
    slack_id: string;
    full_name: string;
    company_id: string;
    active: true;
    country: string | null;
    office_id: string | null;
  }> = [];

  for (const u of scopedUsers) {
    const slackId = u.slack_id as string;
    const full_name = (u.real_name as string).trim();
    const email = emailBySlackId.get(slackId);
    const company_id = resolveCompanyId(u.organization);
    const country = typeof u.country === "string" && u.country.trim() ? u.country.trim().toUpperCase() : null;
    const office_id = resolveOfficeId(u.country);

    if (email) {
      rowsWithEmail.push({ slack_id: slackId, full_name, company_id, active: true, email, country, office_id });
    } else {
      rowsWithoutEmail.push({ slack_id: slackId, full_name, company_id, active: true, country, office_id });
    }
  }

  // El upsert con service role puede actualizar una fila existente aunque
  // sea de otra oficina. Cerramos esa vía para admins normales si un
  // slack_id cambió de país en el directorio.
  if (callerOfficeId) {
    const slackIds = scopedUsers.map((u) => u.slack_id as string);
    for (let offset = 0; offset < slackIds.length; offset += 100) {
      const { data: existing, error } = await adminClient
        .from("employees")
        .select("slack_id, office_id")
        .in("slack_id", slackIds.slice(offset, offset + 100));
      if (error) {
        return jsonResponse({ error: "No se pudo comprobar la oficina de los colaboradores." }, 500);
      }
      if (existing?.some((employee) => employee.office_id && employee.office_id !== callerOfficeId)) {
        return jsonResponse({ error: "Hay colaboradores ya asignados a otra oficina. Contacta a un superadmin." }, 403);
      }
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
