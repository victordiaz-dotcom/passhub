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

// Sin JWT a propósito: se llama ANTES de iniciar sesión, para resolver
// "username" al correo real que espera supabase.auth.signInWithPassword.
// Solo expone el correo, nunca una lista ni ningún otro dato del perfil.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const username = body.username?.trim().toLowerCase();
  if (!username) {
    return jsonResponse({ error: "Falta username." }, 400);
  }

  const { data } = await adminClient
    .from("profiles")
    .select("email")
    .eq("username", username)
    .eq("active", true)
    .maybeSingle();

  if (!data) {
    return jsonResponse({ error: "Usuario o contraseña incorrectos." }, 404);
  }

  return jsonResponse({ email: data.email });
});
