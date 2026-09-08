import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AutoCompleteInput } from "@/components/AutoCompleteInput";
import { mergeVisitorCompanySuggestions } from "@/lib/visitorCompanySuggestions";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

type Company = { id: string; name: string };
type Division = { id: string; company_id: string; name: string };
type VisitType = { id: string; name: string };

const OTROS_SENTINEL = "__otros__";

const emptyForm = {
  visitorName: "",
  visitorCompany: "",
  visitorPhone: "",
  visitorEmail: "",
  companyId: "",
  visitType: "",
  customVisitType: "",
  hasVehicle: "",
  vehiclePlate: "",
  vehicleColor: "",
  vehicleModel: "",
  reason: "",
  division: "",
  visitDate: "",
  visitTime: "",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PreRegistro() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [visitorCompanySuggestions, setVisitorCompanySuggestions] = useState<string[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El campo "División" solo aparece si la empresa elegida tiene divisiones
  // registradas en la base de datos — nada hardcodeado a un nombre de
  // empresa en particular.
  const companyDivisions = divisions.filter((division) => division.company_id === form.companyId);
  const hasDivisions = companyDivisions.length > 0;

  useEffect(() => {
    supabase.functions
      .invoke("public-preregister", { body: { action: "companies" } })
      .then(({ data }) => setCompanies(data?.companies ?? []));
  }, []);

  useEffect(() => {
    supabase.functions
      .invoke("public-preregister", { body: { action: "divisions" } })
      .then(({ data }) => setDivisions(data?.divisions ?? []));
  }, []);

  useEffect(() => {
    supabase.functions
      .invoke("public-preregister", { body: { action: "visitTypes" } })
      .then(({ data }) => setVisitTypes(data?.visitTypes ?? []));
  }, []);

  useEffect(() => {
    supabase.functions
      .invoke("public-preregister", { body: { action: "visitorCompanies" } })
      .then(({ data }) =>
        setVisitorCompanySuggestions(mergeVisitorCompanySuggestions(data?.visitorCompanies ?? []))
      );
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.companyId) {
      setError("Selecciona la empresa que visitas.");
      return;
    }

    const resolvedVisitType =
      form.visitType === OTROS_SENTINEL ? form.customVisitType.trim() : form.visitType;

    if (!resolvedVisitType) {
      setError("Escribe el tipo de visita.");
      return;
    }

    setSubmitting(true);

    const { data, error: invokeError } = await supabase.functions.invoke("public-preregister", {
      body: { action: "create", ...form, visitType: resolvedVisitType },
    });

    setSubmitting(false);

    if (invokeError || data?.error) {
      setError(data?.error ?? (await edgeFunctionErrorMessage(invokeError, "No se pudo crear el pre-registro. Intenta de nuevo.")));
      return;
    }

    navigate(`/pre-registro/confirmacion/${data.token}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-card p-8 shadow-sm">
        <img src="/logo.png" alt="PassHub" className="mb-3 h-14 w-auto" />
        <h1 className="font-display text-xl font-bold text-ink">PassHub</h1>
        <p className="mb-1 text-sm font-medium text-ink-soft">Pre-registro de visita</p>
        <p className="mb-6 text-sm text-ink-soft">
          Llena tus datos antes de llegar. Recibirás un código QR que deberás mostrar en recepción.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="visitorName" className="mb-1 block text-sm font-medium text-ink-soft">
              Tu nombre
            </label>
            <input
              id="visitorName"
              type="text"
              required
              value={form.visitorName}
              onChange={(e) => setForm({ ...form, visitorName: e.target.value })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="visitorCompany" className="mb-1 block text-sm font-medium text-ink-soft">
              Tu empresa
            </label>
            <AutoCompleteInput
              id="visitorCompany"
              required
              suggestions={visitorCompanySuggestions}
              value={form.visitorCompany}
              onChange={(visitorCompany) => setForm({ ...form, visitorCompany })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="visitorPhone" className="mb-1 block text-sm font-medium text-ink-soft">
              Teléfono
            </label>
            <input
              id="visitorPhone"
              type="tel"
              required
              value={form.visitorPhone}
              onChange={(e) => setForm({ ...form, visitorPhone: e.target.value })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="visitorEmail" className="mb-1 block text-sm font-medium text-ink-soft">
              Correo electrónico
            </label>
            <input
              id="visitorEmail"
              type="email"
              required
              value={form.visitorEmail}
              onChange={(e) => setForm({ ...form, visitorEmail: e.target.value })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="company" className="mb-1 block text-sm font-medium text-ink-soft">
              Empresa que visitas
            </label>
            <select
              id="company"
              required
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value, division: "" })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
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
            <label htmlFor="visitType" className="mb-1 block text-sm font-medium text-ink-soft">
              Tipo de visita
            </label>
            <select
              id="visitType"
              required
              value={form.visitType}
              onChange={(e) => setForm({ ...form, visitType: e.target.value, customVisitType: "" })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="" disabled>
                Selecciona una opción
              </option>
              {visitTypes.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                </option>
              ))}
              <option value={OTROS_SENTINEL}>Otros</option>
            </select>
          </div>

          {form.visitType === OTROS_SENTINEL && (
            <div>
              <label htmlFor="customVisitType" className="mb-1 block text-sm font-medium text-ink-soft">
                Especifica el tipo de visita
              </label>
              <input
                id="customVisitType"
                type="text"
                required
                value={form.customVisitType}
                onChange={(e) => setForm({ ...form, customVisitType: e.target.value })}
                className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>
          )}

          <div>
            <label htmlFor="hasVehicle" className="mb-1 block text-sm font-medium text-ink-soft">
              ¿Traes vehículo?
            </label>
            <select
              id="hasVehicle"
              required
              value={form.hasVehicle}
              onChange={(e) =>
                setForm({
                  ...form,
                  hasVehicle: e.target.value,
                  ...(e.target.value === "no"
                    ? { vehiclePlate: "", vehicleColor: "", vehicleModel: "" }
                    : {}),
                })
              }
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="" disabled>
                Selecciona una opción
              </option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </div>

          {form.hasVehicle === "si" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="vehiclePlate" className="mb-1 block text-sm font-medium text-ink-soft">
                  Placas
                </label>
                <input
                  id="vehiclePlate"
                  type="text"
                  required
                  value={form.vehiclePlate}
                  onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
                  className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="vehicleColor" className="mb-1 block text-sm font-medium text-ink-soft">
                  Color
                </label>
                <input
                  id="vehicleColor"
                  type="text"
                  required
                  value={form.vehicleColor}
                  onChange={(e) => setForm({ ...form, vehicleColor: e.target.value })}
                  className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="vehicleModel" className="mb-1 block text-sm font-medium text-ink-soft">
                  Modelo
                </label>
                <input
                  id="vehicleModel"
                  type="text"
                  required
                  value={form.vehicleModel}
                  onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })}
                  className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          )}

          {hasDivisions && (
            <div>
              <label htmlFor="division" className="mb-1 block text-sm font-medium text-ink-soft">
                División
              </label>
              <select
                id="division"
                required
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value })}
                className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              >
                <option value="" disabled>
                  Selecciona una división
                </option>
                {companyDivisions.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="reason" className="mb-1 block text-sm font-medium text-ink-soft">
              Motivo
            </label>
            <input
              id="reason"
              type="text"
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="visitDate" className="mb-1 block text-sm font-medium text-ink-soft">
                Fecha de visita
              </label>
              <input
                id="visitDate"
                type="date"
                required
                min={todayIso()}
                value={form.visitDate}
                onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="visitTime" className="mb-1 block text-sm font-medium text-ink-soft">
                Hora
              </label>
              <input
                id="visitTime"
                type="time"
                required
                value={form.visitTime}
                onChange={(e) => setForm({ ...form, visitTime: e.target.value })}
                className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Generar pre-registro"}
          </button>
        </form>
      </div>
    </div>
  );
}
