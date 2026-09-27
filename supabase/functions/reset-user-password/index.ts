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
    return jsonResponse({ error: "Solo un administrador puede restablecer contraseñas." }, 403);
  }

  // Esta consulta (y las de rol de arriba) usan la service role, que
  // ignora RLS -- a diferencia de has_role() (que sí exige profiles.active),
  // así que sin este chequeo una cuenta desactivada con una sesión todavía
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

  let body: { userId?: string; password?: string; requireChange?: boolean };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const { userId, password, requireChange } = body;

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

  // Mismo criterio que create-user: un admin normal solo puede actuar sobre
  // cuentas de su propia oficina. Confirmado con el usuario: no se
  // restringe por empresa -- varias empresas comparten una misma oficina
  // física, y quien administra esa oficina debe poder restablecer
  // contraseñas de cualquiera de ellas.
  if (!callerIsSuperadmin && callerProfile?.office_id) {
    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("office_id")
      .eq("id", userId)
      .maybeSingle();

    if (!targetProfile || targetProfile.office_id !== callerProfile.office_id) {
      return jsonResponse({ error: "Solo puedes actuar sobre cuentas de tu propia oficina." }, 403);
    }
  }

  // El admin puede escribir la contraseña él mismo o dejar que se genere
  // una automáticamente, y decide aparte (checkbox en el front, por
  // defecto marcado) si la persona debe cambiarla al iniciar sesión o si
  // esta ya queda como definitiva.
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

  await adminClient.from("profiles").update({ must_change_password: requireChange ?? true }).eq("id", userId);

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
