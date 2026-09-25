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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

  const { data: callerRoleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  const callerRoles = (callerRoleRows ?? []).map((r) => r.role);
  const callerIsAdmin = callerRoles.includes("admin") || callerRoles.includes("superadmin");
  const callerIsSuperadmin = callerRoles.includes("superadmin");

  if (!callerIsAdmin) {
    return jsonResponse({ error: "Solo un administrador puede editar el correo de una cuenta." }, 403);
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

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, MAX_BODY_BYTES);
  } catch {
    return jsonResponse({ error: "Solicitud demasiado grande." }, 413);
  }

  let body: { userId?: string; email?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const userId = body.userId;
  const email = body.email?.trim().toLowerCase();

  if (!userId || !email) {
    return jsonResponse({ error: "Faltan campos requeridos." }, 400);
  }

  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ error: "Correo inválido." }, 400);
  }

  // Igual que en reset-user-password: un admin normal solo puede editar
  // cuentas de recepción/guardia; tocar cuentas de admin o super admin
  // queda reservado a super admin.
  const { data: targetRoleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const targetIsElevated = (targetRoleRows ?? []).some(
    (r) => r.role === "admin" || r.role === "superadmin"
  );

  if (targetIsElevated && !callerIsSuperadmin) {
    return jsonResponse(
      { error: "Solo un super admin puede editar el correo de cuentas de admin o super admin." },
      403
    );
  }

  const { data: target, error: targetError } = await adminClient
    .from("profiles")
    .select("full_name, email, office_id")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return jsonResponse({ error: "No se encontró la cuenta." }, 404);
  }

  // Mismo criterio que create-user: un admin normal solo puede actuar sobre
  // cuentas de su propia oficina. Faltaba aquí -- un admin de una oficina
  // podía editar el correo de cualquier cuenta de OTRA oficina.
  if (!callerIsSuperadmin && callerProfile?.office_id && target.office_id !== callerProfile.office_id) {
    return jsonResponse({ error: "Solo puedes actuar sobre cuentas de tu propia oficina." }, 403);
  }

  if (target.email === email) {
    return jsonResponse({ success: true, email });
  }

  // Se actualiza primero auth.users (la credencial real de login) y solo si
  // eso funciona se actualiza profiles.email, para que ambos queden
  // sincronizados. Esto es lo que permite liberar un correo: se edita la
  // cuenta suspendida para quitárselo, y luego ya se puede asignar a otra.
  const { error: authError } = await adminClient.auth.admin.updateUserById(userId, { email });

  if (authError) {
    const message = /already been registered|already exists|duplicate/i.test(authError.message)
      ? "Ese correo ya está en uso por otra cuenta."
      : "No se pudo actualizar el correo.";
    return jsonResponse({ error: message }, authError.status === 422 ? 409 : 400);
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ email })
    .eq("id", userId);

  if (profileError) {
    // Revertir auth.users para no dejar el correo de login desincronizado
    // del perfil.
    await adminClient.auth.admin.updateUserById(userId, { email: target.email });
    return jsonResponse({ error: "No se pudo actualizar el correo." }, 400);
  }

  await adminClient.from("audit_logs").insert({
    actor_id: caller.id,
    action: "update_email",
    entity: "profiles",
    entity_id: userId,
    detail: { full_name: target.full_name, old_email: target.email, new_email: email },
  });

  return jsonResponse({ success: true, email });
});
