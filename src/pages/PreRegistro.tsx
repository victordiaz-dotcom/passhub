import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AutoCompleteInput } from "@/components/AutoCompleteInput";
import { mergeVisitorCompanySuggestions } from "@/lib/visitorCompanySuggestions";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import {
  PREREG_T,
  resolveInitialLang,
  storeLang,
  translateServerError,
  type Lang,
} from "@/lib/preregistroI18n";

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
  const [lang, setLang] = useState<Lang>(() => resolveInitialLang(null));
  const t = PREREG_T[lang];

  function changeLang(next: Lang) {
    setLang(next);
    storeLang(next);
  }

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
      setError(t.errorCompany);
      return;
    }

    const resolvedVisitType =
      form.visitType === OTROS_SENTINEL ? form.customVisitType.trim() : form.visitType;

    if (!resolvedVisitType) {
      setError(t.errorVisitType);
      return;
    }

    setSubmitting(true);

    const { data, error: invokeError } = await supabase.functions.invoke("public-preregister", {
      body: { action: "create", ...form, visitType: resolvedVisitType },
    });

    setSubmitting(false);

    if (invokeError || data?.error) {
      const rawError = data?.error ?? (await edgeFunctionErrorMessage(invokeError, t.errorFallback));
      setError(translateServerError(rawError, lang));
      return;
    }

    navigate(`/pre-registro/confirmacion/${data.token}?lang=${lang}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="card w-full max-w-md p-8">
        <div className="mb-3 flex items-start justify-between">
          <img src="/logo.png" alt="PassHub" className="h-14 w-auto" />
          <div className="flex gap-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => changeLang("es")}
              className={lang === "es" ? "text-accent" : "text-ink-soft hover:text-ink"}
            >
              ES
            </button>
            <span className="text-ink-soft">/</span>
            <button
              type="button"
              onClick={() => changeLang("en")}
              className={lang === "en" ? "text-accent" : "text-ink-soft hover:text-ink"}
            >
              EN
            </button>
          </div>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">{t.appName}</h1>
        <p className="mb-1 text-sm font-medium text-ink-soft">{t.subtitle}</p>
        <p className="mb-6 text-sm text-ink-soft">{t.intro}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="visitorName" className="mb-1 block text-sm font-medium text-ink-soft">
              {t.visitorName}
            </label>
            <input
              id="visitorName"
              type="text"
              required
              value={form.visitorName}
              onChange={(e) => setForm({ ...form, visitorName: e.target.value })}
              className="input-field h-auto py-2"
            />
          </div>

          <div>
            <label htmlFor="visitorCompany" className="mb-1 block text-sm font-medium text-ink-soft">
              {t.visitorCompany}
            </label>
            <AutoCompleteInput
              id="visitorCompany"
              required
              suggestions={visitorCompanySuggestions}
              value={form.visitorCompany}
              onChange={(visitorCompany) => setForm({ ...form, visitorCompany })}
              className="input-field h-auto py-2"
            />
          </div>

          <div>
            <label htmlFor="visitorPhone" className="mb-1 block text-sm font-medium text-ink-soft">
              {t.visitorPhone}
            </label>
            <input
              id="visitorPhone"
              type="tel"
              required
              value={form.visitorPhone}
              onChange={(e) => setForm({ ...form, visitorPhone: e.target.value })}
              className="input-field h-auto py-2"
            />
          </div>

          <div>
            <label htmlFor="visitorEmail" className="mb-1 block text-sm font-medium text-ink-soft">
              {t.visitorEmail}
            </label>
            <input
              id="visitorEmail"
              type="email"
              required
              value={form.visitorEmail}
              onChange={(e) => setForm({ ...form, visitorEmail: e.target.value })}
              className="input-field h-auto py-2"
            />
          </div>

          <div>
            <label htmlFor="company" className="mb-1 block text-sm font-medium text-ink-soft">
              {t.company}
            </label>
            <select
              id="company"
              required
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value, division: "" })}
              className="input-field h-auto py-2"
            >
              <option value="" disabled>
                {t.companyPlaceholder}
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
              {t.visitType}
            </label>
            <select
              id="visitType"
              required
              value={form.visitType}
              onChange={(e) => setForm({ ...form, visitType: e.target.value, customVisitType: "" })}
              className="input-field h-auto py-2"
            >
              <option value="" disabled>
                {t.visitTypePlaceholder}
              </option>
              {visitTypes.map((option) => (
                <option key={option.id} value={option.name}>
                  {option.name}
                </option>
              ))}
              <option value={OTROS_SENTINEL}>{t.otros}</option>
            </select>
          </div>

          {form.visitType === OTROS_SENTINEL && (
            <div>
              <label htmlFor="customVisitType" className="mb-1 block text-sm font-medium text-ink-soft">
                {t.customVisitType}
              </label>
              <input
                id="customVisitType"
                type="text"
                required
                value={form.customVisitType}
                onChange={(e) => setForm({ ...form, customVisitType: e.target.value })}
                className="input-field h-auto py-2"
              />
            </div>
          )}

          <div>
            <label htmlFor="hasVehicle" className="mb-1 block text-sm font-medium text-ink-soft">
              {t.hasVehicle}
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
              className="input-field h-auto py-2"
            >
              <option value="" disabled>
                {t.visitTypePlaceholder}
              </option>
              <option value="si">{t.yes}</option>
              <option value="no">{t.no}</option>
            </select>
          </div>

          {form.hasVehicle === "si" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="vehiclePlate" className="mb-1 block text-sm font-medium text-ink-soft">
                  {t.vehiclePlate}
                </label>
                <input
                  id="vehiclePlate"
                  type="text"
                  required
                  value={form.vehiclePlate}
                  onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
                  className="input-field h-auto py-2"
                />
              </div>
              <div>
                <label htmlFor="vehicleColor" className="mb-1 block text-sm font-medium text-ink-soft">
                  {t.vehicleColor}
                </label>
                <input
                  id="vehicleColor"
                  type="text"
                  required
                  value={form.vehicleColor}
                  onChange={(e) => setForm({ ...form, vehicleColor: e.target.value })}
                  className="input-field h-auto py-2"
                />
              </div>
              <div>
                <label htmlFor="vehicleModel" className="mb-1 block text-sm font-medium text-ink-soft">
                  {t.vehicleModel}
                </label>
                <input
                  id="vehicleModel"
                  type="text"
                  required
                  value={form.vehicleModel}
                  onChange={(e) => setForm({ ...form, vehicleModel: e.target.value })}
                  className="input-field h-auto py-2"
                />
              </div>
            </div>
          )}

          {hasDivisions && (
            <div>
              <label htmlFor="division" className="mb-1 block text-sm font-medium text-ink-soft">
                {t.division}
              </label>
              <select
                id="division"
                required
                value={form.division}
                onChange={(e) => setForm({ ...form, division: e.target.value })}
                className="input-field h-auto py-2"
              >
                <option value="" disabled>
                  {t.divisionPlaceholder}
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
              {t.reason}
            </label>
            <input
              id="reason"
              type="text"
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="input-field h-auto py-2"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="visitDate" className="mb-1 block text-sm font-medium text-ink-soft">
                {t.visitDate}
              </label>
              <input
                id="visitDate"
                type="date"
                required
                min={todayIso()}
                value={form.visitDate}
                onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                className="input-field h-auto py-2"
              />
            </div>

            <div>
              <label htmlFor="visitTime" className="mb-1 block text-sm font-medium text-ink-soft">
                {t.visitTime}
              </label>
              <input
                id="visitTime"
                type="time"
                required
                value={form.visitTime}
                onChange={(e) => setForm({ ...form, visitTime: e.target.value })}
                className="input-field h-auto py-2"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary h-auto w-full py-2"
          >
            {submitting ? t.submitting : t.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
