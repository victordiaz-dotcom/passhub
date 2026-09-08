import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SearchableSelect } from "@/components/SearchableSelect";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PhotoUploadField } from "@/components/PhotoUploadField";
import { AutoCompleteInput } from "@/components/AutoCompleteInput";
import { mergeVisitorCompanySuggestions } from "@/lib/visitorCompanySuggestions";
import { checkoutVisit } from "@/lib/checkout";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Pick<Tables<"employees">, "id" | "full_name">;
type Company = Pick<Tables<"companies">, "id" | "name">;
type Division = Pick<Tables<"divisions">, "id" | "name">;
type VisitType = Pick<Tables<"visit_types">, "id" | "name">;

const OTROS_SENTINEL = "__otros__";
type InsideVisit = Pick<
  Tables<"visits">,
  "id" | "folio" | "visitor_name" | "check_in_at"
> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
  companies: Pick<Tables<"companies">, "name"> | null;
};

const QR_REGION_ID = "qr-reader-region";

const inputClass =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink invalid:border-danger focus:border-accent focus:outline-none disabled:bg-paper disabled:opacity-60";
const plainSelectClass =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none disabled:bg-paper disabled:opacity-60";
const invalidSelectClass =
  "w-full appearance-none rounded-md border border-line bg-card px-3 py-2 text-sm text-ink invalid:border-danger focus:border-accent focus:outline-none disabled:bg-paper disabled:opacity-60";

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function nowTimeLocal() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CheckIn() {
  const { session, companyId } = useAuth();

  const [tab, setTab] = useState<"registrar" | "dentro">("registrar");
  const [insideVisits, setInsideVisits] = useState<InsideVisit[]>([]);
  const [insideLoading, setInsideLoading] = useState(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<InsideVisit | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [visitorCompanySuggestions, setVisitorCompanySuggestions] = useState<string[]>([]);
  const [visitorName, setVisitorName] = useState("");
  const [visitorCompany, setVisitorCompany] = useState("");
  const [visitorPhone, setVisitorPhone] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [hostEmployeeId, setHostEmployeeId] = useState("");
  const [visitType, setVisitType] = useState("");
  const [customVisitType, setCustomVisitType] = useState("");
  const [hasVehicle, setHasVehicle] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [reason, setReason] = useState("");
  const [division, setDivision] = useState("");
  const [visitDate, setVisitDate] = useState(todayLocal());
  const [visitTime, setVisitTime] = useState("");
  // Id de carpeta de Storage para las fotos de este intento de registro —
  // no es (ni necesita ser) el id real de la visita, que Postgres genera al
  // insertar la fila: el vínculo real entre la visita y sus fotos son las
  // columnas visitor_photo_path/id_photo_path, que guardan la ruta exacta
  // usando este mismo id. Se mantiene estable durante todo el intento
  // (nunca se regenera entre subir una foto y enviar el formulario) y solo
  // cambia al iniciar un registro nuevo, en resetForm().
  const [photoSessionId, setPhotoSessionId] = useState(() => crypto.randomUUID());
  const [photoResetSignal, setPhotoResetSignal] = useState(0);
  const [visitorPhotoUploaded, setVisitorPhotoUploaded] = useState(false);
  const [idPhotoUploaded, setIdPhotoUploaded] = useState(false);
  const [visitorPhotoPreview, setVisitorPhotoPreview] = useState<string | null>(null);

  const [preregistrationId, setPreregistrationId] = useState<string | null>(null);
  const [preregistrationDate, setPreregistrationDate] = useState<string | null>(null);
  const [preregistrationExpiresOn, setPreregistrationExpiresOn] = useState<string | null>(null);
  const [preregistrationReused, setPreregistrationReused] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folio, setFolio] = useState<string | null>(null);

  useEffect(() => {
    // Cualquier cuenta (admin o recepción) puede elegir cualquier empresa:
    // un solo mostrador de recepción atiende a las 4 empresas.
    supabase
      .from("companies")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCompanies(data ?? []));
  }, []);

  useEffect(() => {
    if (companyId) setSelectedCompanyId(companyId);
  }, [companyId]);

  useEffect(() => {
    // El campo "División" solo aparece si la empresa elegida tiene
    // divisiones registradas en la base de datos — nada hardcodeado a un
    // nombre de empresa en particular.
    if (!selectedCompanyId) {
      setDivisions([]);
      return;
    }
    supabase
      .from("divisions")
      .select("id, name")
      .eq("company_id", selectedCompanyId)
      .order("name")
      .then(({ data }) => setDivisions(data ?? []));
  }, [selectedCompanyId]);

  useEffect(() => {
    // Sin filtrar por empresa a propósito: quien recibe puede ser cualquier
    // colaborador dado de alta, sin importar a qué empresa esté asignada la
    // visita (varias empresas comparten una sola recepción física).
    supabase
      .from("employees")
      .select("id, full_name")
      .eq("active", true)
      .order("full_name")
      .then(({ data }) => setEmployees(data ?? []));
  }, []);

  useEffect(() => {
    // "Empresa del visitante" aprende de lo que más se repite en visitas
    // reales ya registradas, y se completa con una lista de sugerencias
    // comunes (paqueterías, proveedores frecuentes) mientras se acumula
    // historial propio.
    supabase
      .from("visits")
      .select("visitor_company")
      .not("visitor_company", "is", null)
      .then(({ data }) => {
        const counts = new Map<string, { label: string; count: number }>();
        for (const row of data ?? []) {
          const name = row.visitor_company?.trim();
          if (!name) continue;
          const key = name.toLowerCase();
          const existing = counts.get(key);
          if (existing) existing.count += 1;
          else counts.set(key, { label: name, count: 1 });
        }
        const frequent = Array.from(counts.values())
          .sort((a, b) => b.count - a.count)
          .map((entry) => entry.label);
        setVisitorCompanySuggestions(mergeVisitorCompanySuggestions(frequent));
      });
  }, []);

  useEffect(() => {
    supabase
      .from("visit_types")
      .select("id, name")
      .order("name")
      .then(({ data }) => setVisitTypes(data ?? []));
  }, []);

  async function loadInsideVisits() {
    setInsideLoading(true);
    const { data } = await supabase
      .from("visits")
      .select(
        "id, folio, visitor_name, check_in_at, employees(full_name), companies(name)"
      )
      .eq("visit_date", todayLocal())
      .eq("status", "dentro")
      .order("check_in_at", { ascending: false });
    setInsideVisits((data as InsideVisit[] | null) ?? []);
    setInsideLoading(false);
  }

  useEffect(() => {
    loadInsideVisits();
  }, []);

  async function handleCheckout(visitId: string) {
    if (!session?.user) return;

    setCheckoutError(null);

    const { error: checkoutErr } = await checkoutVisit(visitId, session.user.id);

    if (checkoutErr) {
      console.error(checkoutErr);
      setCheckoutError("No se pudo registrar la salida. Intenta de nuevo.");
      return;
    }

    loadInsideVisits();
  }

  useEffect(() => {
    if (!scannerOpen) return;

    const scanner = new Html5Qrcode(QR_REGION_ID);

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          setScannerOpen(false);
          handleScanResult(decodedText);
        },
        () => {}
      )
      .catch(() => setScanError("No se pudo acceder a la cámara."));

    return () => {
      scanner
        .stop()
        .catch(() => {})
        .finally(() => scanner.clear());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOpen]);

  async function handleScanResult(scannedToken: string) {
    setError(null);
    setScanError(null);

    // El QR trae access_token, no el id interno de la fila (ver migración
    // 0041) — recepción sigue viendo la fila completa vía RLS normal, esto
    // solo cambia por qué columna se busca.
    const { data, error: lookupError } = await supabase
      .from("visit_preregistrations")
      .select("*")
      .eq("access_token", scannedToken)
      .maybeSingle();

    if (lookupError || !data) {
      setError("No se encontró el pre-registro escaneado.");
      return;
    }

    if (data.status === "cancelada" || data.status === "vencida") {
      setError(`Este pre-registro está marcado como "${data.status}" y ya no es válido.`);
      return;
    }

    // El QR sigue sirviendo para reingresos hasta 7 días después de la
    // visita original: la misma persona puede volver dentro de esa semana
    // sin volver a llenar el pre-registro, solo confirmando fecha de hoy.
    const expiresOn = data.extended_until ?? addDays(data.visit_date, 7);
    if (todayLocal() > expiresOn) {
      setError(`Este pre-registro venció el ${formatDate(expiresOn)}. Pide uno nuevo para volver a ingresar.`);
      return;
    }

    // La empresa anfitriona del formulario se ajusta a la del pre-registro
    // escaneado, en vez de exigir que ya coincidiera con lo seleccionado.
    setSelectedCompanyId(data.company_id);
    setVisitorName(data.visitor_name);
    setVisitorCompany(data.visitor_company ?? "");
    setVisitorPhone((data as { visitor_phone?: string }).visitor_phone ?? "");
    setVisitorEmail((data as { visitor_email?: string }).visitor_email ?? "");
    setHostEmployeeId(data.host_employee_id ?? "");
    const scannedVisitType = (data as { visit_type?: string }).visit_type ?? "";
    if (scannedVisitType && !visitTypes.some((option) => option.name === scannedVisitType)) {
      setVisitType(OTROS_SENTINEL);
      setCustomVisitType(scannedVisitType);
    } else {
      setVisitType(scannedVisitType);
      setCustomVisitType("");
    }
    setHasVehicle((data as { has_vehicle?: boolean }).has_vehicle ?? false);
    setVehiclePlate((data as { vehicle_plate?: string }).vehicle_plate ?? "");
    setVehicleColor((data as { vehicle_color?: string }).vehicle_color ?? "");
    setVehicleModel((data as { vehicle_model?: string }).vehicle_model ?? "");
    setReason(data.reason ?? "");
    // Fecha y hora se autocompletan con el momento real del escaneo, no con
    // lo que traía el pre-registro (que pudo haberse creado para otro día u
    // otra hora) — así siempre queda la entrada real, aunque se reutilice.
    setVisitDate(todayLocal());
    setVisitTime(nowTimeLocal());
    setDivision((data as { division?: string }).division ?? "");
    setPreregistrationId(data.id);
    setPreregistrationDate(data.visit_date);
    setPreregistrationExpiresOn(expiresOn);
    setPreregistrationReused(data.status === "usada");
  }

  function resetForm() {
    setVisitorName("");
    setVisitorCompany("");
    setVisitorPhone("");
    setVisitorEmail("");
    setSelectedCompanyId(companyId ?? "");
    setHostEmployeeId("");
    setVisitType("");
    setCustomVisitType("");
    setHasVehicle(false);
    setVehiclePlate("");
    setVehicleColor("");
    setVehicleModel("");
    setReason("");
    setDivision("");
    setVisitDate(todayLocal());
    setVisitTime("");
    setPhotoSessionId(crypto.randomUUID());
    setPhotoResetSignal((n) => n + 1);
    setVisitorPhotoUploaded(false);
    setIdPhotoUploaded(false);
    setPreregistrationId(null);
    setPreregistrationDate(null);
    setPreregistrationExpiresOn(null);
    setPreregistrationReused(false);
  }

  function startNewRegistration() {
    resetForm();
    setFolio(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedCompanyId || !session?.user) {
      setError("Selecciona la empresa anfitriona.");
      return;
    }
    if (!visitorPhotoUploaded || !idPhotoUploaded) {
      setError("Debes capturar la foto del visitante y la foto del INE.");
      return;
    }

    const resolvedVisitType = visitType === OTROS_SENTINEL ? customVisitType.trim() : visitType;
    if (!resolvedVisitType) {
      setError("Escribe el tipo de visita.");
      return;
    }

    setSubmitting(true);

    // Las fotos ya se subieron al elegirlas (PhotoUploadField) — misma ruta
    // que se usó entonces, calculada igual con selectedCompanyId +
    // photoSessionId, que no cambiaron desde entonces.
    const visitorPhotoPath = `${selectedCompanyId}/${photoSessionId}/visitante.jpg`;
    const idPhotoPath = `${selectedCompanyId}/${photoSessionId}/ine.jpg`;

    const { data, error: insertError } = await supabase
      .from("visits")
      .insert({
        company_id: selectedCompanyId,
        visitor_name: visitorName,
        visitor_company: visitorCompany || null,
        visitor_phone: visitorPhone || null,
        visitor_email: visitorEmail || null,
        host_employee_id: hostEmployeeId || null,
        visit_type: resolvedVisitType,
        has_vehicle: hasVehicle,
        vehicle_plate: hasVehicle ? vehiclePlate || null : null,
        vehicle_color: hasVehicle ? vehicleColor || null : null,
        vehicle_model: hasVehicle ? vehicleModel || null : null,
        reason: reason || null,
        division: hasDivisions ? division || null : null,
        visitor_photo_path: visitorPhotoPath,
        id_photo_path: idPhotoPath,
        created_by: session.user.id,
        preregistration_id: preregistrationId,
      })
      .select("id, folio")
      .single();

    setSubmitting(false);

    if (insertError || !data) {
      console.error(insertError);
      setError("No se pudo registrar la visita. Intenta de nuevo.");
      return;
    }

    if (preregistrationId) {
      // Al reutilizar el mismo QR en un reingreso, la fecha/hora del
      // pre-registro se actualiza a las de este check-in real (no se queda
      // pegado a cuando se generó originalmente) — y de paso "renueva" los
      // 7 días de vigencia contados desde este último uso.
      await supabase
        .from("visit_preregistrations")
        .update({
          status: "usada",
          used_at: new Date().toISOString(),
          visit_date: visitDate,
          visit_time: visitTime || null,
        })
        .eq("id", preregistrationId);
    }

    // No bloquea el registro de la visita si Slack falla o tarda: es un
    // aviso de mejor esfuerzo, no parte del flujo crítico de check-in.
    supabase.functions.invoke("notify-slack", { body: { visitId: data.id } }).then(({ error: notifyError }) => {
      if (notifyError) console.error("No se pudo notificar por Slack:", notifyError);
    });

    setFolio(data.folio);
    loadInsideVisits();
  }

  const hostEmployeeName = employees.find((employee) => employee.id === hostEmployeeId)?.full_name;
  const companyName = companies.find((company) => company.id === selectedCompanyId)?.name ?? null;
  const hasDivisions = divisions.length > 0;

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-ink">Registrar visita</h1>
          <button
            type="button"
            onClick={() => setTab(tab === "registrar" ? "dentro" : "registrar")}
            className="text-sm font-medium text-accent hover:text-accent-dark"
          >
            {tab === "registrar"
              ? `Ver visitantes dentro${insideVisits.length > 0 ? ` (${insideVisits.length})` : ""}`
              : "Volver a registrar"}
          </button>
        </div>

        {tab === "dentro" ? (
          <div>
            {checkoutError && <p className="mb-3 text-sm text-danger">{checkoutError}</p>}
            <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-soft">
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Visitante</th>
                  <th className="px-4 py-3 font-medium">Empresa</th>
                  <th className="px-4 py-3 font-medium">A quién visita</th>
                  <th className="px-4 py-3 font-medium">Hora de entrada</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!insideLoading && insideVisits.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
                      No hay visitantes dentro en este momento.
                    </td>
                  </tr>
                )}
                {insideVisits.map((visit) => (
                  <tr key={visit.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{visit.folio}</td>
                    <td className="px-4 py-3 text-ink">{visit.visitor_name}</td>
                    <td className="px-4 py-3 text-ink-soft">{visit.companies?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">{visit.employees?.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {new Date(visit.check_in_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setCheckoutTarget(visit)}
                        className="whitespace-nowrap text-sm font-medium text-accent hover:text-accent-dark"
                      >
                        Registrar salida
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
            <div className="space-y-6">
              {!scannerOpen && !preregistrationId && (
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="w-full rounded-md border border-accent bg-card px-3 py-2 text-sm font-medium text-accent hover:bg-accent-tint"
                >
                  Escanear QR de pre-registro
                </button>
              )}

              {scannerOpen && (
                <div className="rounded-lg border border-line bg-card p-4">
                  <div id={QR_REGION_ID} className="mx-auto w-full max-w-xs" />
                  {scanError && <p className="mt-2 text-sm text-danger">{scanError}</p>}
                  <button
                    type="button"
                    onClick={() => setScannerOpen(false)}
                    className="mt-3 text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    Cancelar escaneo
                  </button>
                </div>
              )}

              {preregistrationId && (
                <div className="rounded-lg border border-accent bg-accent-tint p-3 text-sm text-accent-dark">
                  <p>
                    {preregistrationReused
                      ? "Este visitante ya ingresó antes con este mismo pre-registro"
                      : "Datos cargados desde un pre-registro"}
                    {preregistrationDate ? ` (originalmente para el ${formatDate(preregistrationDate)})` : ""}.
                    Confirma los datos y la fecha de hoy, toma las fotos y envía.
                    {preregistrationExpiresOn
                      ? ` Vigente para reingresos hasta el ${formatDate(preregistrationExpiresOn)}.`
                      : ""}
                  </p>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="mt-1 text-sm font-medium underline hover:no-underline"
                  >
                    Quitar y llenar a mano
                  </button>
                </div>
              )}

              <div className="rounded-lg bg-card p-6 shadow-sm">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-accent">
                  Datos de la visita
                </h2>
                <div className="mb-5 mt-2 border-b border-line" />

                <form
                  id="checkin-form"
                  onSubmit={handleSubmit}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2"
                >
                  <div>
                    <label htmlFor="hostCompany" className="mb-1 block text-sm font-medium text-ink-soft">
                      Empresa anfitriona <span className="text-accent">*</span>
                    </label>
                    <select
                      id="hostCompany"
                      required
                      disabled={!!folio}
                      value={selectedCompanyId}
                      onChange={(e) => {
                        setSelectedCompanyId(e.target.value);
                        setDivision("");
                      }}
                      className={plainSelectClass}
                    >
                      <option value="" disabled>
                        Selecciona una empresa
                      </option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="hostEmployee" className="mb-1 block text-sm font-medium text-ink-soft">
                      Colaborador que recibe <span className="text-accent">*</span>
                    </label>
                    <SearchableSelect
                      id="hostEmployee"
                      required
                      disabled={!!folio}
                      placeholder="Escribe para buscar..."
                      options={employees.map((employee) => ({ id: employee.id, label: employee.full_name }))}
                      value={hostEmployeeId}
                      onChange={setHostEmployeeId}
                      className={invalidSelectClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitType" className="mb-1 block text-sm font-medium text-ink-soft">
                      Tipo de visita <span className="text-accent">*</span>
                    </label>
                    <select
                      id="visitType"
                      required
                      disabled={!!folio}
                      value={visitType}
                      onChange={(e) => {
                        setVisitType(e.target.value);
                        setCustomVisitType("");
                      }}
                      className={invalidSelectClass}
                    >
                      <option value="" disabled></option>
                      {visitTypes.map((option) => (
                        <option key={option.id} value={option.name}>
                          {option.name}
                        </option>
                      ))}
                      <option value={OTROS_SENTINEL}>Otros</option>
                    </select>
                  </div>

                  {visitType === OTROS_SENTINEL && (
                    <div>
                      <label htmlFor="customVisitType" className="mb-1 block text-sm font-medium text-ink-soft">
                        Especifica el tipo de visita <span className="text-accent">*</span>
                      </label>
                      <input
                        id="customVisitType"
                        type="text"
                        required
                        disabled={!!folio}
                        value={customVisitType}
                        onChange={(e) => setCustomVisitType(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  )}

                  {hasDivisions && (
                    <div className="sm:col-span-2">
                      <label htmlFor="division" className="mb-1 block text-sm font-medium text-ink-soft">
                        División <span className="text-accent">*</span>
                      </label>
                      <select
                        id="division"
                        required
                        disabled={!!folio}
                        value={division}
                        onChange={(e) => setDivision(e.target.value)}
                        className={invalidSelectClass}
                      >
                        <option value="" disabled></option>
                        {divisions.map((option) => (
                          <option key={option.id} value={option.name}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label htmlFor="visitorName" className="mb-1 block text-sm font-medium text-ink-soft">
                      Nombre del visitante <span className="text-accent">*</span>
                    </label>
                    <input
                      id="visitorName"
                      type="text"
                      required
                      disabled={!!folio}
                      value={visitorName}
                      onChange={(e) => setVisitorName(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitorCompany" className="mb-1 block text-sm font-medium text-ink-soft">
                      Empresa del visitante <span className="text-accent">*</span>
                    </label>
                    <AutoCompleteInput
                      id="visitorCompany"
                      required
                      disabled={!!folio}
                      placeholder="Ej. DHL, CFE, Amazon"
                      suggestions={visitorCompanySuggestions}
                      value={visitorCompany}
                      onChange={setVisitorCompany}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitorPhone" className="mb-1 block text-sm font-medium text-ink-soft">
                      Teléfono <span className="text-accent">*</span>
                    </label>
                    <input
                      id="visitorPhone"
                      type="tel"
                      required
                      disabled={!!folio}
                      value={visitorPhone}
                      onChange={(e) => setVisitorPhone(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitorEmail" className="mb-1 block text-sm font-medium text-ink-soft">
                      Correo electrónico <span className="text-accent">*</span>
                    </label>
                    <input
                      id="visitorEmail"
                      type="email"
                      required
                      disabled={!!folio}
                      value={visitorEmail}
                      onChange={(e) => setVisitorEmail(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitDate" className="mb-1 block text-sm font-medium text-ink-soft">
                      Fecha de la visita <span className="text-accent">*</span>
                    </label>
                    <input
                      id="visitDate"
                      type="date"
                      required
                      disabled={!!folio}
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label htmlFor="visitTime" className="mb-1 block text-sm font-medium text-ink-soft">
                      Hora <span className="text-accent">*</span>
                    </label>
                    <input
                      id="visitTime"
                      type="time"
                      required
                      disabled={!!folio}
                      value={visitTime}
                      onChange={(e) => setVisitTime(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="reason" className="mb-1 block text-sm font-medium text-ink-soft">
                      Motivo <span className="text-accent">*</span>
                    </label>
                    <input
                      id="reason"
                      type="text"
                      required
                      disabled={!!folio}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </form>
              </div>

              <div className="rounded-lg bg-card p-6 shadow-sm">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-accent">
                  Fotografías
                </h2>
                <div className="mb-5 mt-2 border-b border-line" />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <PhotoUploadField
                    label="Fotografía del visitante"
                    companyId={selectedCompanyId}
                    sessionId={photoSessionId}
                    fileName="visitante.jpg"
                    disabled={!!folio || !selectedCompanyId}
                    resetSignal={photoResetSignal}
                    onUploadedChange={setVisitorPhotoUploaded}
                    onPreviewChange={setVisitorPhotoPreview}
                  />

                  <PhotoUploadField
                    label="Fotografía del ID"
                    companyId={selectedCompanyId}
                    sessionId={photoSessionId}
                    fileName="ine.jpg"
                    disabled={!!folio || !selectedCompanyId}
                    resetSignal={photoResetSignal}
                    onUploadedChange={setIdPhotoUploaded}
                  />
                </div>
              </div>
            </div>

            <div className="lg:sticky lg:top-6">
              <div className="rounded-lg bg-ink p-5 text-white shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Pase de visitante
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
                    {folio ?? "Sin folio"}
                  </span>
                </div>

                <div className="flex h-40 items-center justify-center overflow-hidden rounded-md bg-ink-soft">
                  {visitorPhotoPreview ? (
                    <img
                      src={visitorPhotoPreview}
                      alt="Foto del visitante"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm text-white/40">Sin foto</span>
                  )}
                </div>

                <p className="mt-4 font-display text-lg font-bold text-white">
                  {visitorName || "Nombre del visitante"}
                </p>
                <p className="text-sm text-white/50">{visitorCompany || "Empresa del visitante"}</p>

                <dl className="mt-4 divide-y divide-white/10 text-sm">
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Visita a</dt>
                    <dd className="text-white">{companyName ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Recibe</dt>
                    <dd className="text-white">{hostEmployeeName ?? "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Tipo de visita</dt>
                    <dd className="text-white">
                      {(visitType === OTROS_SENTINEL ? customVisitType : visitType) || "—"}
                    </dd>
                  </div>
                  {hasVehicle && (
                    <div className="flex items-center justify-between py-2">
                      <dt className="text-white/50">Vehículo</dt>
                      <dd className="text-white">
                        {vehicleColor} {vehicleModel} · {vehiclePlate}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Fecha</dt>
                    <dd className="text-white">{visitDate ? formatDate(visitDate) : "—"}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-white/50">Hora</dt>
                    <dd className="text-white">{visitTime || "—"}</dd>
                  </div>
                </dl>
              </div>

              {error && <p className="mt-3 text-sm text-danger">{error}</p>}

              <button
                type="submit"
                form="checkin-form"
                disabled={submitting || !!folio}
                className="mt-4 w-full rounded-md bg-accent px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-accent-dark disabled:opacity-50"
              >
                {folio ? "Pase generado" : submitting ? "Registrando..." : "Registrar visita"}
              </button>

              {folio && (
                <button
                  type="button"
                  onClick={startNewRegistration}
                  className="mt-2 w-full text-center text-sm font-medium text-accent hover:text-accent-dark"
                >
                  Registrar otra visita
                </button>
              )}

              <p className="mt-2 text-center text-xs text-ink-soft">Verifica el pase antes de registrar</p>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!checkoutTarget}
        title="¿Registrar la salida de este visitante?"
        message={checkoutTarget ? `Se registrará la salida de ${checkoutTarget.visitor_name}.` : undefined}
        onConfirm={() => {
          if (checkoutTarget) handleCheckout(checkoutTarget.id);
          setCheckoutTarget(null);
        }}
        onCancel={() => setCheckoutTarget(null)}
      />
    </div>
  );
}
