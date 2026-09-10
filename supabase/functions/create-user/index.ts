import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ROLES = ["admin", "recepcion", "superadmin", "guardia"];
const ELEVATED_ROLES = ["admin", "superadmin"];

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

// Equivalente a "Leaked Password Protection" de Supabase Auth, que en este
// proyecto no se puede activar desde el dashboard por estar en plan Free.
// Solo aplica a contraseñas que escribe el admin (las generadas con
// generateTempPassword son de alta entropía y nunca aparecerán en una
// filtración, así que no vale la pena la llamada externa para esas).
// K-anonimato: solo se manda el prefijo de 5 caracteres del hash SHA-1,
// nunca la contraseña ni el hash completo. Fail-open si la API no responde
// — no se bloquea la creación de cuentas por una caída de un tercero.
async function isPasswordPwned(password: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
  const hashHex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const prefix = hashHex.slice(0, 5);
  const suffix = hashHex.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) return false;
    const text = await res.text();
    return text.split("\n").some((line) => line.split(":")[0].trim() === suffix);
  } catch {
    return false;
  }
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

  const { data: callerRoleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  const callerRoles = (callerRoleRows ?? []).map((r) => r.role);
  const callerIsAdmin = callerRoles.includes("admin") || callerRoles.includes("superadmin");
  const callerIsSuperadmin = callerRoles.includes("superadmin");

  if (!callerIsAdmin) {
    return jsonResponse({ error: "Solo un administrador puede crear cuentas." }, 403);
  }

  let body: {
    email?: string;
    username?: string;
    fullName?: string;
    companyId?: string;
    role?: string;
    password?: string;
    requireChange?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const { email, fullName, companyId, role, password, requireChange } = body;
  const username = body.username?.trim().toLowerCase();

  if (!email || !username || !fullName || !companyId || !role) {
    return jsonResponse({ error: "Faltan campos requeridos." }, 400);
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return jsonResponse({ error: "Rol inválido." }, 400);
  }

  // Otorgar admin o superadmin queda reservado a superadmin, para que un
  // admin normal no pueda ascenderse a sí mismo ni repartir ese poder.
  if (ELEVATED_ROLES.includes(role) && !callerIsSuperadmin) {
    return jsonResponse({ error: "Solo un super admin puede crear cuentas de admin o super admin." }, 403);
  }

  // El admin puede escribir la contraseña él mismo o dejar que se genere
  // una automáticamente, y decide aparte (checkbox en el front, por
  // defecto marcado) si la persona debe cambiarla al iniciar sesión por
  // primera vez — ver must_change_password más abajo.
  if (password !== undefined && password.trim().length < 8) {
    return jsonResponse({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
  }

  if (password !== undefined && (await isPasswordPwned(password.trim()))) {
    return jsonResponse(
      { error: "Esa contraseña apareció en una filtración de datos conocida. Elige otra." },
      400
    );
  }

  const tempPassword = password?.trim() || generateTempPassword();

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

  // must_change_password: el admin decide si la persona debe elegir su
  // propia contraseña al iniciar sesión por primera vez (checkbox en el
  // front, por defecto marcado) o si la que se le dio/generó ya queda como
  // definitiva.
  const { error: profileError } = await adminClient.from("profiles").insert({
    id: newUserId,
    full_name: fullName,
    email,
    username,
    company_id: companyId,
    active: true,
    must_change_password: requireChange ?? true,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(newUserId);
    const message = profileError.message.includes("profiles_username_lower_idx")
      ? "Ese usuario ya está en uso por otra cuenta."
      : "No se pudo crear el perfil.";
    return jsonResponse({ error: message }, 400);
  }

  const { error: roleError } = await adminClient.from("user_roles").insert({
    user_id: newUserId,
    role,
  });

  if (roleError) {
    await adminClient.auth.admin.deleteUser(newUserId);
    return jsonResponse({ error: "No se pudo asignar el rol." }, 400);
  }

  // El trigger de user_roles ya registra grant_role, pero solo con
  // user_id+role — este log adicional guarda nombre/correo/usuario de la
  // cuenta creada, que es lo que de verdad se necesita para auditar "quién
  // creó a quién".
  await adminClient.from("audit_logs").insert({
    actor_id: caller.id,
    action: "create_user",
    entity: "profiles",
    entity_id: newUserId,
    detail: { full_name: fullName, email, username, role, passwordMode: password !== undefined ? "manual" : "auto" },
  });

  return jsonResponse({ userId: newUserId, email, tempPassword });
});
