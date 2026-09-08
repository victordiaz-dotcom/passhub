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

const GENERIC_ERROR = { error: "Usuario o contraseña incorrectos." };

// Sin JWT a propósito: se llama ANTES de iniciar sesión, para autenticar por
// "username" (Supabase Auth solo sabe autenticar por correo). A diferencia
// de la versión anterior, la contraseña se valida aquí mismo en vez de
// devolver el correo real al cliente para un segundo intento de login: así
// nunca se expone el correo real, y "el username no existe" y "el username
// existe pero la contraseña es incorrecta" devuelven exactamente la misma
// respuesta genérica — ya no se puede enumerar cuentas por esta vía.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const username = body.username?.trim().toLowerCase();
  const password = body.password;
  if (!username || !password) {
    return jsonResponse(GENERIC_ERROR, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
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
