import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  let body: { userId?: string; email?: string };
  try {
    body = await req.json();
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
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return jsonResponse({ error: "No se encontró la cuenta." }, 404);
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
