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

const MAX_BODY_BYTES = 100_000;

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
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

function addDaysIso(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Service role: este endpoint es público (sin JWT), así que la única
  // manera de leer/escribir estas tablas es con este cliente.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // 30 solicitudes / 5 min por IP: un visitante real dispara varias en una
  // sola sesión de formulario (companies/divisions/visitTypes/create), esto
  // solo corta un flood.
  const allowed = await checkRateLimit(adminClient, "public-preregister", getClientIp(req), 30, 5);
  if (!allowed) {
    return jsonResponse({ error: "Demasiadas solicitudes. Espera unos minutos." }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const action = body.action;

  // Lookups de solo lectura para poblar el formulario público (nombres de
  // empresa no son datos sensibles, pero las tablas no tienen RLS para
  // "anon", así que se resuelven aquí con la service role key). No hay un
  // lookup equivalente de colaboradores: expondría a todo el personal sin
  // autenticación, así que "a quién visitas" se define en recepción.
  if (action === "companies") {
    const { data } = await adminClient.from("companies").select("id, name").order("name");
    return jsonResponse({ companies: data ?? [] });
  }

  if (action === "divisions") {
    // Todas, sin filtrar por empresa: el front las filtra por company_id
    // localmente para decidir si mostrar el campo "División".
    const { data } = await adminClient.from("divisions").select("id, company_id, name").order("name");
    return jsonResponse({ divisions: data ?? [] });
  }

  if (action === "visitTypes") {
    const { data } = await adminClient.from("visit_types").select("id, name").order("name");
    return jsonResponse({ visitTypes: data ?? [] });
  }

  if (action === "visitorCompanies") {
    // Nombres de empresas de visitantes ya usados en visitas reales,
    // ordenados por frecuencia — el front los combina con una lista de
    // sugerencias comunes para autocompletar "Empresa del visitante".
    const { data } = await adminClient
      .from("visits")
      .select("visitor_company")
      .not("visitor_company", "is", null);

    const counts = new Map<string, { label: string; count: number }>();
    for (const row of data ?? []) {
      const name = row.visitor_company?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { label: name, count: 1 });
    }

    const visitorCompanies = Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .map((entry) => entry.label);

    return jsonResponse({ visitorCompanies });
  }

  // Lookup público de un pre-registro por su access_token (uuid no
  // adivinable, distinto del id interno — ver migración 0041: así el id
  // primario nunca es, por sí solo, una llave de acceso público). Solo se
  // devuelven los campos necesarios para mostrarle al visitante su propio
  // pase y el QR — nunca una lista ni datos de otros pre-registros, y nunca
  // el id interno.
  if (action === "get") {
    const token = body.token;
    if (!token || typeof token !== "string") {
      return jsonResponse({ error: "Falta token." }, 400);
    }

    const { data, error } = await adminClient
      .from("visit_preregistrations")
      .select(
        "visitor_name, visitor_company, visitor_phone, visitor_email, visit_type, has_vehicle, vehicle_plate, vehicle_color, vehicle_model, reason, visit_date, visit_time, status, used_at, extended_until, created_at, employees(full_name), companies(name)"
      )
      .eq("access_token", token)
      .maybeSingle();

    if (error || !data) {
      return jsonResponse({ error: "Pre-registro no encontrado." }, 404);
    }

    // Un pre-registro cancelado o vencido ya no debe ser accesible en
    // absoluto: ni sus datos ni su QR se devuelven, en vez de mandarlos y
    // dejar que el front decida si los muestra o no.
    const expiresOn = data.extended_until ?? addDaysIso(data.visit_date, 7);
    const noLongerValid =
      data.status === "cancelada" || data.status === "vencida" || todayIso() > expiresOn;

    if (noLongerValid) {
      return jsonResponse({ error: "Este pre-registro ya venció y no está disponible." }, 410);
    }

    return jsonResponse({ preregistration: data });
  }

  if (action !== "create") {
    return jsonResponse({ error: "Acción inválida." }, 400);
  }

  const visitorName = body.visitorName;
  const visitorCompany = body.visitorCompany;
  const visitorPhone = body.visitorPhone;
  const visitorEmail = body.visitorEmail;
  const companyId = body.companyId;
  const hostEmployeeId = body.hostEmployeeId;
  const visitType = body.visitType;
  const reason = body.reason;
  const division = body.division;
  const visitDate = body.visitDate;
  const visitTime = body.visitTime;
  const hasVehicle = body.hasVehicle;
  const vehiclePlate = body.vehiclePlate;
  const vehicleColor = body.vehicleColor;
  const vehicleModel = body.vehicleModel;

  if (
    typeof visitorName !== "string" ||
    !visitorName.trim() ||
    typeof visitorCompany !== "string" ||
    !visitorCompany.trim() ||
    typeof visitorPhone !== "string" ||
    !visitorPhone.trim() ||
    typeof visitorEmail !== "string" ||
    !visitorEmail.trim() ||
    typeof companyId !== "string" ||
    !companyId ||
    (hostEmployeeId !== undefined && hostEmployeeId !== null && typeof hostEmployeeId !== "string") ||
    typeof visitDate !== "string" ||
    !visitDate ||
    typeof visitTime !== "string" ||
    !visitTime.trim() ||
    typeof visitType !== "string" ||
    !visitType.trim() ||
    typeof reason !== "string" ||
    !reason.trim() ||
    (hasVehicle !== "si" && hasVehicle !== "no")
  ) {
    return jsonResponse({ error: "Faltan campos requeridos." }, 400);
  }

  if (
    hasVehicle === "si" &&
    (typeof vehiclePlate !== "string" ||
      !vehiclePlate.trim() ||
      typeof vehicleColor !== "string" ||
      !vehicleColor.trim() ||
      typeof vehicleModel !== "string" ||
      !vehicleModel.trim())
  ) {
    return jsonResponse({ error: "Faltan los datos del vehículo (placas, color, modelo)." }, 400);
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

  // "A quién visitas" ya no se pide en el formulario público (exponía la
  // lista completa de colaboradores sin autenticación): se elige en
  // recepción al hacer el check-in real, así que aquí es opcional.
  const hasHostEmployee = typeof hostEmployeeId === "string" && hostEmployeeId;

  if (hasHostEmployee) {
    const { data: employee } = await adminClient
      .from("employees")
      .select("id, active")
      .eq("id", hostEmployeeId)
      .maybeSingle();

    if (!employee) {
      return jsonResponse({ error: "El colaborador no existe." }, 400);
    }
    if (!employee.active) {
      return jsonResponse({ error: "El colaborador ya no está activo." }, 400);
    }
  }

  const { data: created, error: insertError } = await adminClient
    .from("visit_preregistrations")
    .insert({
      company_id: companyId,
      visitor_name: visitorName,
      visitor_company: typeof visitorCompany === "string" && visitorCompany ? visitorCompany : null,
      visitor_phone: visitorPhone,
      visitor_email: visitorEmail,
      host_employee_id: hasHostEmployee ? hostEmployeeId : null,
      visit_type: visitType,
      reason: typeof reason === "string" && reason ? reason : null,
      division: typeof division === "string" && division ? division : null,
      visit_date: visitDate,
      visit_time: typeof visitTime === "string" && visitTime ? visitTime : null,
      has_vehicle: hasVehicle === "si",
      vehicle_plate: hasVehicle === "si" ? vehiclePlate : null,
      vehicle_color: hasVehicle === "si" ? vehicleColor : null,
      vehicle_model: hasVehicle === "si" ? vehicleModel : null,
    })
    .select("access_token")
    .single();

  if (insertError || !created) {
    return jsonResponse({ error: "No se pudo crear el pre-registro." }, 400);
  }

  return jsonResponse({ token: created.access_token });
});
