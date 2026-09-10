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

// Mismo generador que create-user: 14 caracteres, sin ambiguos (0/O, 1/l/I),
// con al menos un caracter de cada clase, usando crypto (nunca Math.random()).
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
// filtración). K-anonimato: solo se manda el prefijo de 5 caracteres del
// hash SHA-1, nunca la contraseña ni el hash completo. Fail-open si la API
// no responde — no se bloquea el restablecimiento por una caída de un
// tercero.
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
    return jsonResponse({ error: "Solo un administrador puede restablecer contraseñas." }, 403);
  }

  let body: { userId?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const { userId, password } = body;

  if (!userId) {
    return jsonResponse({ error: "Falta el user_id." }, 400);
  }

  // Un admin normal solo puede restablecer contraseñas de recepción/guardia;
  // tocar cuentas de admin o super admin queda reservado a super admin.
  const { data: targetRoleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const targetIsElevated = (targetRoleRows ?? []).some(
    (r) => r.role === "admin" || r.role === "superadmin"
  );

  if (targetIsElevated && !callerIsSuperadmin) {
    return jsonResponse(
      { error: "Solo un super admin puede restablecer contraseñas de admin o super admin." },
      403
    );
  }

  // El admin puede escribir la contraseña él mismo o dejar que se genere
  // una automáticamente — en ambos casos la persona la cambia al iniciar
  // sesión (must_change_password se deja como estaba, esto no lo toca).
  if (password !== undefined && password.trim().length < 8) {
    return jsonResponse({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
  }

  if (password !== undefined && (await isPasswordPwned(password.trim()))) {
    return jsonResponse(
      { error: "Esa contraseña apareció en una filtración de datos conocida. Elige otra." },
      400
    );
  }

  const finalPassword = password?.trim() || generateTempPassword();

  const { data: updated, error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    password: finalPassword,
  });

  if (updateError || !updated.user) {
    return jsonResponse({ error: updateError?.message ?? "No se pudo restablecer la contraseña." }, 400);
  }

  const { data: target } = await adminClient
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  await adminClient.from("audit_logs").insert({
    actor_id: caller.id,
    action: "reset_password",
    entity: "profiles",
    entity_id: userId,
    detail: {
      full_name: target?.full_name,
      email: target?.email,
      passwordMode: password !== undefined ? "manual" : "auto",
    },
  });

  return jsonResponse({ userId, email: updated.user.email, tempPassword: finalPassword });
});
