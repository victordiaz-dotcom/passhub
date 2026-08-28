import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Pick<Tables<"employees">, "id" | "full_name">;
type InsideVisit = Pick<Tables<"visits">, "id" | "folio" | "visitor_name" | "check_in_at"> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
};

const QR_REGION_ID = "qr-reader-region";

const inputClass =
  "w-full rounded-md border border-line px-3 py-2 text-sm text-ink invalid:border-danger focus:border-accent focus:outline-none disabled:bg-paper disabled:opacity-60";
const plainSelectClass =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none disabled:bg-paper disabled:opacity-60";
const invalidSelectClass =
  "w-full appearance-none rounded-md border border-line bg-card px-3 py-2 text-sm text-ink invalid:border-danger focus:border-accent focus:outline-none disabled:bg-paper disabled:opacity-60";

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function CheckIn() {
  const { session, profile, companyId, signOut } = useAuth();

  const [tab, setTab] = useState<"registrar" | "dentro">("registrar");
  const [insideVisits, setInsideVisits] = useState<InsideVisit[]>([]);
  const [insideLoading, setInsideLoading] = useState(true);

  const [companyName, setCompanyName] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [visitorName, setVisitorName] = useState("");
  const [visitorCompany, setVisitorCompany] = useState("");
  const [hostEmployeeId, setHostEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const [visitDate, setVisitDate] = useState(todayLocal());
  const [visitTime, setVisitTime] = useState("");
  const [visitorPhoto, setVisitorPhoto] = useState<File | null>(null);
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [visitorPhotoPreview, setVisitorPhotoPreview] = useState<string | null>(null);

  const [preregistrationId, setPreregistrationId] = useState<string | null>(null);
  const [preregistrationDate, setPreregistrationDate] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folio, setFolio] = useState<string | null>(null);

  const visitorPhotoInput = useRef<HTMLInputElement>(null);
  const idPhotoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!companyId) return;

    supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single()
      .then(({ data }) => setCompanyName(data?.name ?? null));

    supabase
      .from("employees")
      .select("id, full_name")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("full_name")
      .then(({ data }) => setEmployees(data ?? []));
  }, [companyId]);

  useEffect(() => {
    if (!visitorPhoto) {
      setVisitorPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(visitorPhoto);
    setVisitorPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [visitorPhoto]);

  async function loadInsideVisits() {
    if (!companyId) return;

    setInsideLoading(true);
    const { data } = await supabase
      .from("visits")
      .select("id, folio, visitor_name, check_in_at, employees(full_name)")
      .eq("company_id", companyId)
      .eq("visit_date", todayLocal())
      .eq("status", "dentro")
      .order("check_in_at", { ascending: false });
    setInsideVisits((data as InsideVisit[] | null) ?? []);
    setInsideLoading(false);
  }

  useEffect(() => {
    loadInsideVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function handleCheckout(visitId: string) {
    await supabase
      .from("visits")
      .update({ check_out_at: new Date().toISOString(), status: "fuera" })
      .eq("id", visitId);
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

  async function handleScanResult(id: string) {
    setError(null);
    setScanError(null);

    const { data, error: lookupError } = await supabase
      .from("visit_preregistrations")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (lookupError || !data) {
      setError("No se encontró el pre-registro escaneado.");
      return;
    }

    if (data.company_id !== companyId) {
      setError("Este pre-registro pertenece a otra empresa.");
      return;
    }

    setVisitorName(data.visitor_name);
    setVisitorCompany(data.visitor_company ?? "");
    setHostEmployeeId(data.host_employee_id ?? "");
    setReason(data.reason ?? "");
    setPreregistrationId(data.id);
    setPreregistrationDate(data.visit_date);

    if (data.status !== "pendiente") {
      setError(`Aviso: este pre-registro ya está marcado como "${data.status}".`);
    }
  }

  function resetForm() {
    setVisitorName("");
    setVisitorCompany("");
    setHostEmployeeId("");
    setReason("");
    setVisitDate(todayLocal());
    setVisitTime("");
    setVisitorPhoto(null);
    setIdPhoto(null);
    setPreregistrationId(null);
    setPreregistrationDate(null);
    if (visitorPhotoInput.current) visitorPhotoInput.current.value = "";
    if (idPhotoInput.current) idPhotoInput.current.value = "";
  }

  function startNewRegistration() {
    resetForm();
    setFolio(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyId || !session?.user) {
      setError("Tu perfil no tiene una empresa asignada. Contacta a tu admin.");
      return;
    }
    if (!visitorPhoto || !idPhoto) {
      setError("Debes capturar la foto del visitante y la foto del INE.");
      return;
    }

    setSubmitting(true);

    const tempId = crypto.randomUUID();
    const visitorPhotoPath = `${companyId}/${tempId}/visitante.jpg`;
    const idPhotoPath = `${companyId}/${tempId}/ine.jpg`;

    const { error: visitorUploadError } = await supabase.storage
      .from("visit-photos")
      .upload(visitorPhotoPath, visitorPhoto, { contentType: visitorPhoto.type });

    if (visitorUploadError) {
      console.error(visitorUploadError);
      setError("No se pudo subir la foto del visitante. Intenta de nuevo.");
      setSubmitting(false);
      return;
    }

    const { error: idUploadError } = await supabase.storage
      .from("visit-photos")
      .upload(idPhotoPath, idPhoto, { contentType: idPhoto.type });

    if (idUploadError) {
      console.error(idUploadError);
      setError("No se pudo subir la foto del INE. Intenta de nuevo.");
      setSubmitting(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("visits")
      .insert({
        company_id: companyId,
        visitor_name: visitorName,
        visitor_company: visitorCompany || null,
        host_employee_id: hostEmployeeId || null,
        reason: reason || null,
        visitor_photo_path: visitorPhotoPath,
        id_photo_path: idPhotoPath,
        created_by: session.user.id,
        preregistration_id: preregistrationId,
      })
      .select("folio")
      .single();

    setSubmitting(false);

    if (insertError || !data) {
      console.error(insertError);
      setError("No se pudo registrar la visita. Intenta de nuevo.");
      return;
    }

    if (preregistrationId) {
      await supabase
        .from("visit_preregistrations")
        .update({ status: "usada", used_at: new Date().toISOString() })
        .eq("id", preregistrationId);
    }

    setFolio(data.folio);
    loadInsideVisits();
  }

  const initial = profile?.full_name?.trim().charAt(0).toUpperCase() ?? "?";
  const hostEmployeeName = employees.find((employee) => employee.id === hostEmployeeId)?.full_name;

  return (
    <div className="min-h-screen bg-paper">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent font-display text-lg font-bold text-white">
              {initial}
            </div>
            <div>
              <h1 className="font-display text-lg font-bold leading-tight">Registro de visitas</h1>
              <p className="text-sm text-white/50">Recepción · captura de acceso</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setTab(tab === "registrar" ? "dentro" : "registrar")}
              className="text-sm text-white/70 hover:text-white"
            >
              Visitantes dentro{insideVisits.length > 0 ? ` (${insideVisits.length})` : ""}
            </button>
            <button type="button" onClick={() => signOut()} className="text-sm text-white/50 hover:text-white/80">
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {tab === "dentro" ? (
          <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-soft">
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Visitante</th>
                  <th className="px-4 py-3 font-medium">A quién visita</th>
                  <th className="px-4 py-3 font-medium">Hora de entrada</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {!insideLoading && insideVisits.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                      No hay visitantes dentro en este momento.
                    </td>
                  </tr>
                )}
                {insideVisits.map((visit) => (
                  <tr key={visit.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{visit.folio}</td>
                    <td className="px-4 py-3 text-ink">{visit.visitor_name}</td>
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
                        onClick={() => handleCheckout(visit.id)}
                        className="text-sm font-medium text-accent hover:text-accent-dark"
                      >
                        Registrar salida
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                    Datos cargados desde un pre-registro
                    {preregistrationDate ? ` para el ${preregistrationDate}` : ""}. Confirma los datos,
                    toma las fotos y envía.
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
                      value={companyId ?? ""}
                      onChange={() => {}}
                      className={plainSelectClass}
                    >
                      <option value="" disabled>
                        Seleccione una empresa
                      </option>
                      {companyId && companyName && <option value={companyId}>{companyName}</option>}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="hostEmployee" className="mb-1 block text-sm font-medium text-ink-soft">
                      Colaborador que recibe <span className="text-accent">*</span>
                    </label>
                    <select
                      id="hostEmployee"
                      required
                      disabled={!!folio}
                      value={hostEmployeeId}
                      onChange={(e) => setHostEmployeeId(e.target.value)}
                      className={invalidSelectClass}
                    >
                      <option value="" disabled></option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

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
                    <input
                      id="visitorCompany"
                      type="text"
                      required
                      disabled={!!folio}
                      placeholder="Ej. DHL, CFE, Amazon"
                      value={visitorCompany}
                      onChange={(e) => setVisitorCompany(e.target.value)}
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
                  <div>
                    <p className="mb-2 text-center text-sm text-ink-soft">Fotografía del visitante</p>
                    <input
                      ref={visitorPhotoInput}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setVisitorPhoto(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={!!folio}
                      onClick={() => visitorPhotoInput.current?.click()}
                      className="w-full rounded-md bg-ink px-4 py-3 text-sm font-bold text-white hover:bg-ink/90 disabled:opacity-60"
                    >
                      Tomar / seleccionar foto
                    </button>
                  </div>

                  <div>
                    <p className="mb-2 text-center text-sm text-ink-soft">Fotografía del ID</p>
                    <input
                      ref={idPhotoInput}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setIdPhoto(e.target.files?.[0] ?? null)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={!!folio}
                      onClick={() => idPhotoInput.current?.click()}
                      className="w-full rounded-md bg-ink px-4 py-3 text-sm font-bold text-white hover:bg-ink/90 disabled:opacity-60"
                    >
                      Tomar / seleccionar foto
                    </button>
                  </div>
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
                      className="h-full w-full object-cover"
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
    </div>
  );
}
