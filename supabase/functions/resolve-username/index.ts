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

const GENERIC_ERROR = { error: "Usuario o contraseña incorrectos." };
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
// Se separa "contar" de "registrar" porque aquí solo deben contar los
// intentos FALLIDOS. Cuando el mismo helper registraba cada llamada, una
// recepción entera detrás de una sola IP pública (que es justo el caso: un
// mostrador compartido) se auto-bloqueaba después de 5 ingresos CORRECTOS en
// 15 minutos, sin que nadie estuviera atacando nada.
async function countFailures(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  identifier: string,
  windowMinutes: number
): Promise<number> {
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

  return count ?? 0;
}

// Atómico (función SECURITY DEFINER con advisory lock, ver migración 0100)
// -- el conteo+inserción anterior desde aquí (SELECT y luego INSERT, dos
// llamadas separadas) dejaba una ventana: varias requests concurrentes
// leían el mismo conteo antes de que cualquiera insertara su fila, así
// que un atacante con suficientes intentos en paralelo se saltaba el
// límite. Devuelve si YA se pasó del límite (incluyendo este fallo), para
// responder 429 en vez del error genérico en ese caso.
async function recordFailure(
  adminClient: ReturnType<typeof createClient>,
  bucket: string,
  identifier: string
): Promise<boolean> {
  const { data } = await adminClient.rpc("rate_limit_record_failure", {
    p_bucket: bucket,
    p_identifier: identifier,
    p_window_minutes: 15,
    p_limit: 10,
  });
  return data === true;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const TOO_MANY = { error: "Demasiados intentos. Espera unos minutos." };
  const ip = getClientIp(req);

  // Cupo por IP: 10 FALLOS / 15 min. Se revisa antes de leer el cuerpo para
  // que un flood de basura no llegue más lejos.
  if ((await countFailures(adminClient, "resolve-username-ip", ip, 15)) >= 10) {
    return jsonResponse(TOO_MANY, 429);
  }

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, MAX_BODY_BYTES);
  } catch {
    return jsonResponse({ error: "Solicitud demasiado grande." }, 413);
  }

  let body: { username?: string; password?: string };
  try {
    body = JSON.parse(rawBody);
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

  // Cupo por USUARIO: 10 fallos / 15 min sobre esa cuenta, sin importar de
  // cuántas IPs vengan. El cupo por IP solo no alcanza contra fuerza bruta
  // distribuida (quien rota IPs tenía intentos ilimitados contra una cuenta
  // conocida), y aquí una respuesta correcta devuelve la sesión completa.
  async function failAttempt() {
    const [ipOverLimit, userOverLimit] = await Promise.all([
      recordFailure(adminClient, "resolve-username-ip", ip),
      recordFailure(adminClient, "resolve-username-user", username!),
    ]);
    if (ipOverLimit || userOverLimit) {
      return jsonResponse(TOO_MANY, 429);
    }
    return jsonResponse(GENERIC_ERROR, 400);
  }

  if ((await countFailures(adminClient, "resolve-username-user", username, 15)) >= 10) {
    return jsonResponse(TOO_MANY, 429);
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("email")
    .eq("username", username)
    .eq("active", true)
    .maybeSingle();

  if (!profile) {
    return await failAttempt();
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
    return await failAttempt();
  }

  // Un ingreso correcto NO consume cupo: si lo consumiera, un mostrador de
  // recepción compartiendo una IP se bloquearía solo a las pocas entradas.
  return jsonResponse({ session: signInData.session });
});
