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

function corsHeadersFor(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://passhub.tendencys.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
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

  // Activar/desactivar cuentas es exclusivo de super_admin (a diferencia de
  // crear cuentas o restablecer contraseñas, donde un admin normal también
  // puede actuar sobre recepción/guardia). Ver migración 0048.
  const { data: callerRoleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  const callerIsSuperadmin = (callerRoleRows ?? []).some((r) => r.role === "superadmin");

  if (!callerIsSuperadmin) {
    return jsonResponse({ error: "Solo un super admin puede activar o desactivar cuentas." }, 403);
  }

  let body: { userId?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const { userId, active } = body;

  if (!userId || typeof active !== "boolean") {
    return jsonResponse({ error: "Faltan campos requeridos." }, 400);
  }

  if (userId === caller.id) {
    return jsonResponse({ error: "No puedes desactivar tu propia cuenta." }, 400);
  }

  const { data: target, error: targetError } = await adminClient
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return jsonResponse({ error: "No se encontró la cuenta." }, 404);
  }

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ active })
    .eq("id", userId);

  if (updateError) {
    return jsonResponse({ error: "No se pudo actualizar el estado de la cuenta." }, 400);
  }

  await adminClient.from("audit_logs").insert({
    actor_id: caller.id,
    action: active ? "activate_user" : "deactivate_user",
    entity: "profiles",
    entity_id: userId,
    detail: { full_name: target.full_name, email: target.email },
  });

  return jsonResponse({ success: true, active });
});
