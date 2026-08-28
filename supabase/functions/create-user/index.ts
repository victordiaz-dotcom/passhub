import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = ["admin", "recepcion"];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Contraseña temporal: 14 caracteres, sin ambiguos (0/O, 1/l/I), con al menos
// un caracter de cada clase, generada con crypto (nunca Math.random()).
function generateTempPassword(length = 14) {
  const sets = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnpqrstuvwxyz",
    "23456789",
    "!@#$%^&*",
  ];
  const all = sets.join("");

  const randomChar = (charset: string) => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return charset[bytes[0] % charset.length];
  };

  const required = sets.map(randomChar);
  const rest = Array.from({ length: length - required.length }, () => randomChar(all));
  const chars = [...required, ...rest];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

Deno.serve(async (req) => {
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

  // Cliente con service role: nunca se expone al front, solo vive en el server.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: callerRole } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!callerRole) {
    return jsonResponse({ error: "Solo un administrador puede crear cuentas." }, 403);
  }

  let body: { email?: string; fullName?: string; companyId?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const { email, fullName, companyId, role } = body;

  if (!email || !fullName || !companyId || !role) {
    return jsonResponse({ error: "Faltan campos requeridos." }, 400);
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return jsonResponse({ error: "Rol inválido." }, 400);
  }

  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    return jsonResponse({ error: createError?.message ?? "No se pudo crear el usuario." }, 400);
  }

  const newUserId = created.user.id;

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: newUserId,
    full_name: fullName,
    email,
    company_id: companyId,
    active: true,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUserId);
    return jsonResponse({ error: "No se pudo crear el perfil." }, 400);
  }

  const { error: roleError } = await adminClient.from("user_roles").insert({
    user_id: newUserId,
    role,
  });

  if (roleError) {
    await adminClient.auth.admin.deleteUser(newUserId);
    return jsonResponse({ error: "No se pudo asignar el rol." }, 400);
  }

  return jsonResponse({ userId: newUserId, email, tempPassword });
});
