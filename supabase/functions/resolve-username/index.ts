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

const GENERIC_ERROR = { error: "Usuario o contraseña incorrectos." };
const MAX_BODY_BYTES = 100_000;

// cf-connecting-ip lo pone Cloudflare (el borde real de Supabase) con la IP
// verdadera del cliente y nadie de afuera puede falsificarlo -- a
// diferencia de x-forwarded-for, que hoy Cloudflare normaliza antes de que
// esta función lo vea, pero que un cliente SÍ podría inyectar directo si
// algún día cambia la topología de red frente a esta función (probado:
// hoy no sirve para saltarse el rate limit, pero es una suposición frágil
// que no vale la pena mantener).
function getClientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? "unknown";
}

// Sin tabla de rate limiting compartida entre funciones (cada Edge Function
// se despliega por separado): se repite este helper corto en cada función
// pública sin JWT. Ventana fija por (bucket, identifier) sobre
// public.edge_rate_limits — se autolimpia en cada chequeo, así que no
// necesita ningún cron aparte.
async function checkRateLimit(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  identifier: string,
  limit: number,
  windowMinutes: number
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  await adminClient
    .from("edge_rate_limits")
    .delete()
    .eq("bucket", bucket)
    .eq("identifier", identifier)
    .lt("created_at", windowStart);

  const { count } = await adminClient
    .from("edge_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket)
    .eq("identifier", identifier);

  if ((count ?? 0) >= limit) return false;

  await adminClient.from("edge_rate_limits").insert({ bucket, identifier });
  return true;
}

// Sin JWT a propósito: se llama ANTES de iniciar sesión, para autenticar por
// "username" (Supabase Auth solo sabe autenticar por correo). A diferencia
// de la versión anterior, la contraseña se valida aquí mismo en vez de
// devolver el correo real al cliente para un segundo intento de login: así
// nunca se expone el correo real, y "el username no existe" y "el username
// existe pero la contraseña es incorrecta" devuelven exactamente la misma
// respuesta genérica — ya no se puede enumerar cuentas por esta vía.
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

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Solicitud demasiado grande." }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // 5 intentos / 15 min por IP: cubre tanto fuerza bruta de contraseña como
  // el intento de volver a enumerar usernames a punta de volumen.
  const allowed = await checkRateLimit(adminClient, "resolve-username", getClientIp(req), 5, 15);
  if (!allowed) {
    return jsonResponse({ error: "Demasiados intentos. Espera unos minutos." }, 429);
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const username = body.username?.trim().toLowerCase();
  // Un espacio al final es invisible en un campo de contraseña y los
  // teclados de celular lo insertan ahí con frecuencia (autocorrección,
  // autocompletar) — se recorta aquí también como defensa adicional,
  // aunque el frontend (Login.tsx) ya lo hace antes de enviar.
  const password = body.password?.trim();
  if (!username || !password) {
    return jsonResponse(GENERIC_ERROR, 400);
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("email")
    .eq("username", username)
    .eq("active", true)
    .maybeSingle();

  if (!profile) {
    return jsonResponse(GENERIC_ERROR, 400);
  }

  // Verificación real de la contraseña con la clave anon — el mismo camino
  // que seguiría el frontend si el usuario hubiera escrito su correo
  // directamente.
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
    email: profile.email,
    password,
  });

  if (signInError || !signInData.session) {
    return jsonResponse(GENERIC_ERROR, 400);
  }

  return jsonResponse({ session: signInData.session });
});
