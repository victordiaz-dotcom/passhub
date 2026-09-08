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

  // Eliminar cuentas es exclusivo de super_admin — a diferencia de crear
  // cuentas o restablecer contraseñas, aquí ni siquiera un admin normal
  // puede tocar cuentas no elevadas. Ver migración 0035.
  const { data: callerRoleRows } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);

  const callerIsSuperadmin = (callerRoleRows ?? []).some((r) => r.role === "superadmin");

  if (!callerIsSuperadmin) {
    return jsonResponse({ error: "Solo un super admin puede eliminar cuentas." }, 403);
  }

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const { userId } = body;

  if (!userId) {
    return jsonResponse({ error: "Falta el user_id." }, 400);
  }

  if (userId === caller.id) {
    return jsonResponse({ error: "No puedes eliminar tu propia cuenta." }, 400);
  }

  // Se borra primero el perfil (RLS de todos modos ya lo restringe a
  // super_admin, pero se usa el service role para poder distinguir el
  // motivo exacto del error). Si la cuenta tiene visitas o pre-registros
  // vinculados, la foreign key lo bloquea a propósito — eso no se rodea
  // aquí, se reporta con un mensaje claro en vez de fallar en silencio.
  const { error: profileError } = await adminClient.from("profiles").delete().eq("id", userId);

  if (profileError) {
    if (profileError.code === "23503") {
      return jsonResponse(
        {
          error:
            "No se puede eliminar: esta cuenta tiene visitas o pre-registros vinculados en su historial.",
        },
        409
      );
    }
    return jsonResponse({ error: "No se pudo eliminar la cuenta. Intenta de nuevo." }, 400);
  }

  // El perfil ya se borró (y user_roles en cascada); esto además retira la
  // cuenta de auth para que no quede huérfana ni bloquee reusar el correo.
  const { error: authError } = await adminClient.auth.admin.deleteUser(userId);
  if (authError) {
    console.error("Perfil eliminado pero falló el borrado en auth:", authError);
  }

  return jsonResponse({ success: true });
});
