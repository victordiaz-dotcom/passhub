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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Service role: este endpoint es público (sin JWT), así que la única
  // manera de leer/escribir estas tablas es con este cliente.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const action = body.action;

  // Lookups de solo lectura para poblar el formulario público (nombres de
  // empresa/colaborador no son datos sensibles, pero las tablas no tienen
  // RLS para "anon", así que se resuelven aquí con la service role key).
  if (action === "companies") {
    const { data } = await adminClient.from("companies").select("id, name").order("name");
    return jsonResponse({ companies: data ?? [] });
  }

  if (action === "employees") {
    const companyId = body.companyId;
    if (!companyId || typeof companyId !== "string") {
      return jsonResponse({ error: "Falta company_id." }, 400);
    }
    const { data } = await adminClient
      .from("employees")
      .select("id, full_name")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("full_name");
    return jsonResponse({ employees: data ?? [] });
  }

  // Lookup público de un pre-registro por su id (uuid no adivinable). Solo
  // se devuelven los campos necesarios para mostrarle al visitante su propio
  // pase y el QR — nunca una lista ni datos de otros pre-registros.
  if (action === "get") {
    const id = body.id;
    if (!id || typeof id !== "string") {
      return jsonResponse({ error: "Falta id." }, 400);
    }

    const { data, error } = await adminClient
      .from("visit_preregistrations")
      .select(
        "id, visitor_name, visitor_company, reason, visit_date, visit_time, status, used_at, created_at, employees(full_name), companies(name)"
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return jsonResponse({ error: "Pre-registro no encontrado." }, 404);
    }

    return jsonResponse({ preregistration: data });
  }

  if (action !== "create") {
    return jsonResponse({ error: "Acción inválida." }, 400);
  }

  const visitorName = body.visitorName;
  const visitorCompany = body.visitorCompany;
  const companyId = body.companyId;
  const hostEmployeeId = body.hostEmployeeId;
  const reason = body.reason;
  const visitDate = body.visitDate;
  const visitTime = body.visitTime;

  if (
    typeof visitorName !== "string" ||
    !visitorName.trim() ||
    typeof companyId !== "string" ||
    !companyId ||
    typeof hostEmployeeId !== "string" ||
    !hostEmployeeId ||
    typeof visitDate !== "string" ||
    !visitDate
  ) {
    return jsonResponse({ error: "Faltan campos requeridos." }, 400);
  }

  if (visitDate < todayIso()) {
    return jsonResponse({ error: "La fecha de la visita no puede ser anterior a hoy." }, 400);
  }

  const { data: company } = await adminClient
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) {
    return jsonResponse({ error: "La empresa no existe." }, 400);
  }

  const { data: employee } = await adminClient
    .from("employees")
    .select("id, company_id, active")
    .eq("id", hostEmployeeId)
    .maybeSingle();

  if (!employee) {
    return jsonResponse({ error: "El colaborador no existe." }, 400);
  }
  if (employee.company_id !== companyId) {
    return jsonResponse({ error: "El colaborador no pertenece a esa empresa." }, 400);
  }
  if (!employee.active) {
    return jsonResponse({ error: "El colaborador ya no está activo." }, 400);
  }

  const { data: created, error: insertError } = await adminClient
    .from("visit_preregistrations")
    .insert({
      company_id: companyId,
      visitor_name: visitorName,
      visitor_company: typeof visitorCompany === "string" && visitorCompany ? visitorCompany : null,
      host_employee_id: hostEmployeeId,
      reason: typeof reason === "string" && reason ? reason : null,
      visit_date: visitDate,
      visit_time: typeof visitTime === "string" && visitTime ? visitTime : null,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    return jsonResponse({ error: "No se pudo crear el pre-registro." }, 400);
  }

  return jsonResponse({ id: created.id });
});
