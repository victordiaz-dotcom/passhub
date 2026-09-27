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

// "Hoy" en la zona del negocio, no en UTC. Con toISOString() el servidor
// pasaba al día siguiente a partir de las 18:00 hora de México y rechazaba
// un pre-registro para HOY con "La fecha de la visita no puede ser anterior
// a hoy". Se usa Monterrey como piso porque es la zona más atrasada de las
// oficinas activas: si allá todavía es hoy, en Madrid ya es hoy o después,
// así que ninguna de las dos se rechaza por error.
function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const MAX_BODY_BYTES = 100_000;

// Mirar solo el header content-length no protege nada: con
// "Transfer-Encoding: chunked" un cliente lo puede omitir por completo (o
// mentir), y aun así Deno intenta leer el body entero sin límite propio --
// probado en vivo, un body de unos MB sin content-length dejó esta función
// colgada más de dos minutos antes de que la plataforma la matara por su
// cuenta, un endpoint público sin JWT donde cualquiera en internet puede
// mandar cuantas de estas quiera en paralelo. Este helper sí impone un
// límite real cortando la lectura del stream apenas se pasa del máximo,
// sin importar lo que el cliente haya declarado.
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

// País del visitante según su IP real -- se usa para preseleccionar la
// oficina en el link único de pre-registro (México/España) en vez de la
// zona horaria del DISPOSITIVO: esa se puede leer con
// Intl.DateTimeFormat() en el navegador, pero una VPN cambia la
// IP/ubicación real, NO la zona horaria del sistema operativo -- así que
// por horario, alguien conectado por VPN seguía viendo el país equivocado.
//
// Primero se intenta el header que pondría Cloudflare si algún día queda
// delante de esta función (gratis, sin llamada externa); pero se comprobó
// en vivo -- con una VPN real y también en pruebas automatizadas -- que
// hoy ese header simplemente NO llega (Supabase no lo está pasando desde
// donde sea que corran las Edge Functions). Por eso hay un segundo paso
// real: resolver la IP contra ipinfo.io (gratis hasta 50k consultas/mes,
// sin api key, HTTPS). Fail-open a null si cualquiera de los dos falla --
// nunca se bloquea el pre-registro por esto, solo se le pregunta al
// visitante en vez de adivinar.
async function getClientCountry(req: Request): Promise<string | null> {
  const headerCountry = req.headers.get("cf-ipcountry");
  if (headerCountry && headerCountry !== "XX" && headerCountry !== "T1") {
    return headerCountry.toUpperCase();
  }

  const ip = getClientIp(req);
  if (!ip || ip === "unknown") return null;

  try {
    const res = await fetch(`https://ipinfo.io/${ip}/country`);
    if (!res.ok) return null;
    const text = (await res.text()).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(text) ? text : null;
  } catch {
    return null;
  }
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
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Service role: este endpoint es público (sin JWT), así que la única
  // manera de leer/escribir estas tablas es con este cliente.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let rawBody: string;
  try {
    rawBody = await readBodyWithLimit(req, MAX_BODY_BYTES);
  } catch {
    return jsonResponse({ error: "Solicitud demasiado grande." }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const action = body.action;

  // Cada carga de la página dispara varios lookups de golpe (companies,
  // divisions, visitTypes, fieldConfig, offices) -- con un solo
  // cupo compartido de 30/5min (como antes), bastaban 6 recargas de página
  // para que un visitante real (o alguien probando) se quedara bloqueado
  // sin haber llegado siquiera a enviar el formulario. Se separan en 3
  // cupos: los lookups (baratos, de solo lectura) con margen amplio para
  // varias recargas; "create" (la acción real a limitar contra spam) más
  // ajustado pero generoso para una persona real; "get" (pantalla de
  // confirmación) igual que antes.
  const LOOKUP_ACTIONS = new Set([
    "companies",
    "divisions",
    "visitTypes",
    "fieldConfig",
    "offices",
    "officeFacilities",
  ]);
  let rateLimitBucket: string;
  let rateLimit: number;
  if (action === "get") {
    rateLimitBucket = "public-preregister-get";
    rateLimit = 30;
  } else if (typeof action === "string" && LOOKUP_ACTIONS.has(action)) {
    rateLimitBucket = "public-preregister-lookup";
    rateLimit = 60;
  } else {
    rateLimitBucket = "public-preregister-create";
    rateLimit = 10;
  }
  const allowed = await checkRateLimit(adminClient, rateLimitBucket, getClientIp(req), rateLimit, 5);
  if (!allowed) {
    return jsonResponse({ error: "Demasiadas solicitudes. Espera unos minutos." }, 429);
  }

  // Lookups de solo lectura para poblar el formulario público (nombres de
  // empresa no son datos sensibles, pero las tablas no tienen RLS para
  // "anon", así que se resuelven aquí con la service role key). No hay un
  // lookup equivalente de colaboradores: expondría a todo el personal sin
  // autenticación, así que "a quién visitas" se define en recepción.
  if (action === "companies") {
    const { data } = await adminClient.from("companies").select("id, name").eq("active", true).order("name");
    return jsonResponse({ companies: data ?? [] });
  }

  // Oficinas activas, para que el link público (uno solo, sin /mx ni /es)
  // pueda preseleccionar la que corresponde -- ver getClientCountry() más
  // arriba para por qué se resuelve por IP y no por zona horaria. Solo
  // nombre y país: no es información sensible, es lo que ya dice el
  // letrero de la recepción.
  if (action === "offices") {
    const { data } = await adminClient
      .from("offices")
      .select("id, name, country")
      .eq("active", true)
      .order("name");
    return jsonResponse({ offices: data ?? [], detectedCountry: await getClientCountry(req) });
  }

  // Instalaciones de una oficina puntual (ej. Madrid: Envia.com,
  // Fulfillment) -- el front la llama de nuevo cada vez que cambia la
  // oficina elegida, así que solo se le pide una a la vez en vez de
  // mandarlas todas de golpe.
  if (action === "officeFacilities") {
    const officeIdRaw = body.officeId;
    if (typeof officeIdRaw !== "string" || !officeIdRaw) {
      return jsonResponse({ facilities: [] });
    }
    const { data } = await adminClient
      .from("office_facilities")
      .select("id, name")
      .eq("office_id", officeIdRaw)
      .eq("active", true)
      .order("name");
    return jsonResponse({ facilities: data ?? [] });
  }

  if (action === "divisions") {
    // Todas, sin filtrar por empresa: el front las filtra por company_id
    // localmente para decidir si mostrar el campo "División".
    const { data } = await adminClient
      .from("divisions")
      .select("id, company_id, name")
      .eq("active", true)
      .order("name");
    return jsonResponse({ divisions: data ?? [] });
  }

  if (action === "visitTypes") {
    const { data } = await adminClient.from("visit_types").select("id, name").eq("active", true).order("name");
    return jsonResponse({ visitTypes: data ?? [] });
  }

  // Config del formulario público (qué campos mostrar/pedir obligatorio, en
  // qué orden, y los campos de texto libre que el admin haya agregado desde
  // Catálogos). Solo las visibles: una fila oculta ni siquiera se anuncia al
  // front.
  if (action === "fieldConfig") {
    const { data } = await adminClient
      .from("preregistro_fields")
      .select("id, kind, field_key, required, sort_order, label_es, label_en")
      .eq("visible", true)
      .order("sort_order");
    return jsonResponse({ fields: data ?? [] });
  }

  // La acción "visitorCompanies" se eliminó: devolvía, sin ninguna sesión,
  // la lista de TODAS las empresas visitantes del historial (proveedores,
  // clientes, candidatos) a quien la pidiera desde internet. El formulario
  // público ahora autocompleta solo con la lista común de paqueterías; las
  // sugerencias aprendidas del historial siguen existiendo del lado de
  // recepción, que ya consulta visits con su propia sesión.

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
        "visitor_name, visitor_company, visitor_phone, visitor_email, visit_type, has_vehicle, vehicle_plate, vehicle_color, vehicle_model, reason, facility, office_id, custom_answers, visit_date, visit_time, status, used_at, extended_until, created_at, employees(full_name), companies(name), offices(name, country, address, phone)"
      )
      .eq("access_token", token)
      .maybeSingle();

    if (error || !data) {
      return jsonResponse({ error: "Pre-registro no encontrado." }, 404);
    }

    // Si se eligió una instalación puntual (Envia.com / Fulfillment), su
    // dirección es más específica que la de la oficina en general -- se
    // manda aparte para que la confirmación muestre esa en vez de la de la
    // oficina (que para Madrid ya ni siquiera tiene una cargada, a
    // propósito: no hay una sola dirección de "Madrid").
    let facilityDetails: { name: string; address: string | null; phone: string | null } | null = null;
    if (data.facility && data.office_id) {
      const { data: facilityRow } = await adminClient
        .from("office_facilities")
        .select("name, address, phone")
        .eq("office_id", data.office_id)
        .eq("name", data.facility)
        .maybeSingle();
      facilityDetails = facilityRow ?? null;
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

    return jsonResponse({ preregistration: { ...data, facilityDetails } });
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

  // visitorName, companyId y fecha/hora son estructurales al pre-registro y
  // siempre obligatorios; el resto de los campos "builtin" pueden marcarse
  // como opcionales/ocultos desde Catálogos → Campos de pre-registro (ver
  // migración 0055), así que su obligatoriedad se resuelve aquí en vez de
  // estar fija en el código.
  const { data: fieldRows } = await adminClient.from("preregistro_fields").select("*");
  const fieldByKey = new Map((fieldRows ?? []).map((f) => [f.field_key as string, f]));

  function isRequired(key: string, fallback: boolean): boolean {
    const f = fieldByKey.get(key);
    if (!f) return fallback;
    if (!f.visible) return false;
    return f.required;
  }

  const visitorCompanyRequired = isRequired("visitorCompany", true);
  const visitorPhoneRequired = isRequired("visitorPhone", true);
  const visitorEmailRequired = isRequired("visitorEmail", true);
  const visitTypeRequired = isRequired("visitType", true);
  const hasVehicleRequired = isRequired("hasVehicle", true);
  const reasonRequired = isRequired("reason", true);

  if (
    typeof visitorName !== "string" ||
    !visitorName.trim() ||
    typeof companyId !== "string" ||
    !companyId ||
    (hostEmployeeId !== undefined && hostEmployeeId !== null && typeof hostEmployeeId !== "string") ||
    typeof visitDate !== "string" ||
    !visitDate ||
    typeof visitTime !== "string" ||
    !visitTime.trim() ||
    (visitorCompanyRequired && (typeof visitorCompany !== "string" || !visitorCompany.trim())) ||
    (visitorPhoneRequired && (typeof visitorPhone !== "string" || !visitorPhone.trim())) ||
    (visitorEmailRequired && (typeof visitorEmail !== "string" || !visitorEmail.trim())) ||
    (visitTypeRequired && (typeof visitType !== "string" || !visitType.trim())) ||
    (hasVehicleRequired && hasVehicle !== "si" && hasVehicle !== "no") ||
    (reasonRequired && (typeof reason !== "string" || !reason.trim()))
  ) {
    return jsonResponse({ error: "Faltan campos requeridos." }, 400);
  }

  // Mismo criterio que isValidName() en src/lib/nameValidation.ts (no se
  // puede importar directo: esta función corre en su propio runtime de
  // Deno) -- \p{L}\p{M} en vez de una lista fija de letras del español,
  // para no rechazar nombres reales de otros idiomas o acentos compuestos
  // por ciertos teclados/IMEs. El front ya valida esto antes de enviar, pero
  // esta es la validación real (alguien podría llamar a este endpoint
  // directo, sin pasar por el formulario).
  const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;
  const trimmedVisitorName = (visitorName as string).trim();
  if (trimmedVisitorName.length > 80 || !NAME_CHARS.test(trimmedVisitorName)) {
    return jsonResponse(
      { error: "El nombre solo puede tener letras, espacios, guiones y apóstrofes (sin números ni símbolos)." },
      400
    );
  }

  // El front ya filtra el teléfono a solo dígitos (máx. 10) mientras se
  // escribe; esto es la validación real (alguien podría llamar a este
  // endpoint directo). Tope de 10, no longitud fija exigida: España usa 9
  // dígitos y esta misma oficina (Madrid) también manda visitantes por
  // aquí -- exigir exactamente 10 rechazaría un teléfono español real.
  if (typeof visitorPhone === "string" && visitorPhone && !/^\d{1,10}$/.test(visitorPhone)) {
    return jsonResponse({ error: "El teléfono solo debe contener números (máximo 10 dígitos)." }, 400);
  }

  // El front ya filtra los caracteres del correo mientras se escribe; esto
  // es la validación real de formato completo.
  const EMAIL_FORMAT = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  if (typeof visitorEmail === "string" && visitorEmail && !EMAIL_FORMAT.test(visitorEmail.trim())) {
    return jsonResponse({ error: "Escribe un correo electrónico válido." }, 400);
  }

  // Si "¿traes vehículo?" no es obligatorio y no se contestó, se trata como
  // "no" (sin datos de vehículo) en vez de rechazar la solicitud.
  const vehicleAnswer = hasVehicle === "si" ? "si" : "no";

  if (
    vehicleAnswer === "si" &&
    (typeof vehiclePlate !== "string" ||
      !vehiclePlate.trim() ||
      typeof vehicleColor !== "string" ||
      !vehicleColor.trim() ||
      typeof vehicleModel !== "string" ||
      !vehicleModel.trim())
  ) {
    return jsonResponse({ error: "Faltan los datos del vehículo (placas, color, modelo)." }, 400);
  }

  // Campos de texto libre que el admin haya agregado. La etiqueta se
  // congela en el momento del envío (ver comentario en la migración 0055).
  const customFieldRows = (fieldRows ?? []).filter((f) => f.kind === "custom" && f.visible);
  const customAnswersInput =
    body.customAnswers && typeof body.customAnswers === "object" && !Array.isArray(body.customAnswers)
      ? (body.customAnswers as Record<string, unknown>)
      : {};

  const customAnswersToStore: Record<string, { label_es: string | null; label_en: string | null; value: string }> =
    {};
  for (const f of customFieldRows) {
    const raw = customAnswersInput[f.field_key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (f.required && !value) {
      return jsonResponse({ error: "Faltan campos requeridos." }, 400);
    }
    if (value) {
      customAnswersToStore[f.field_key] = { label_es: f.label_es, label_en: f.label_en, value };
    }
  }

  if (visitDate < todayIso()) {
    return jsonResponse({ error: "La fecha de la visita no puede ser anterior a hoy." }, 400);
  }

  const { data: company } = await adminClient
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .eq("active", true)
    .maybeSingle();

  if (!company) {
    return jsonResponse({ error: "La empresa no existe." }, 400);
  }

  // Oficina destino: la manda el front ya resuelta (detectada por IP/link de
  // país y confirmada por el visitante si hace falta). Se valida contra la
  // tabla en vez de confiar en el cliente. Obligatoria en solicitudes
  // nuevas -- hallazgo de una revisión externa: aceptar que se omitiera y
  // guardar null dejaba esas filas visibles para CUALQUIER oficina (mismo
  // criterio que "sin oficina" en visits/prereg_select para filas viejas,
  // pero eso es para no romper registros de ANTES de que esta columna
  // existiera, no una puerta para que solicitudes nuevas la salten).
  const officeIdRaw = body.officeId;
  if (typeof officeIdRaw !== "string" || !officeIdRaw) {
    return jsonResponse({ error: "Falta la oficina." }, 400);
  }

  const { data: office } = await adminClient
    .from("offices")
    .select("id, country")
    .eq("id", officeIdRaw)
    .eq("active", true)
    .maybeSingle();

  if (!office) {
    return jsonResponse({ error: "La oficina no existe." }, 400);
  }
  const officeId: string = office.id;
  const officeCountry: string | null = office.country;

  // Instalación dentro de la oficina (ej. Madrid: Envia.com/Fulfillment).
  // Confirmado explícitamente: en el pre-registro público esto SOLO aplica
  // a España (son direcciones realmente distintas) -- Monterrey también
  // tiene instalaciones registradas (Local 3/Envia.com), pero esas son
  // para uso interno de recepción al registrar la entrada (CheckIn.tsx),
  // no para esta pantalla.
  let facility: string | null = null;
  if (officeId && officeCountry === "ES") {
    const { data: officeFacilityRows } = await adminClient
      .from("office_facilities")
      .select("name")
      .eq("office_id", officeId)
      .eq("active", true);

    if (officeFacilityRows && officeFacilityRows.length > 0) {
      const facilityRaw = body.facility;
      const match = officeFacilityRows.find((f) => f.name === facilityRaw);
      if (typeof facilityRaw !== "string" || !facilityRaw || !match) {
        return jsonResponse({ error: "Selecciona a qué instalación vas." }, 400);
      }
      facility = match.name;
    }
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
      office_id: officeId,
      facility,
      // Se guarda el nombre ya recortado -- antes se guardaba el valor
      // CRUDO (con espacios de sobra si los traía), y un tester encontró
      // visitas con nombres como "Pruebas " ya en la base de datos por eso.
      visitor_name: trimmedVisitorName,
      visitor_company: typeof visitorCompany === "string" && visitorCompany ? visitorCompany.trim() : null,
      visitor_phone: typeof visitorPhone === "string" && visitorPhone ? visitorPhone : null,
      visitor_email: typeof visitorEmail === "string" && visitorEmail ? visitorEmail : null,
      host_employee_id: hasHostEmployee ? hostEmployeeId : null,
      visit_type: typeof visitType === "string" && visitType ? visitType : null,
      reason: typeof reason === "string" && reason ? reason : null,
      division: typeof division === "string" && division ? division : null,
      visit_date: visitDate,
      visit_time: typeof visitTime === "string" && visitTime ? visitTime : null,
      has_vehicle: vehicleAnswer === "si",
      vehicle_plate: vehicleAnswer === "si" ? vehiclePlate : null,
      vehicle_color: vehicleAnswer === "si" ? vehicleColor : null,
      vehicle_model: vehicleAnswer === "si" ? vehicleModel : null,
      custom_answers: Object.keys(customAnswersToStore).length ? customAnswersToStore : null,
    })
    .select("access_token")
    .single();

  if (insertError || !created) {
    return jsonResponse({ error: "No se pudo crear el pre-registro." }, 400);
  }

  return jsonResponse({ token: created.access_token });
});
