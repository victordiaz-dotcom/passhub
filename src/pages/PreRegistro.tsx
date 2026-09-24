import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AutoCompleteInput } from "@/components/AutoCompleteInput";
import { mergeVisitorCompanySuggestions } from "@/lib/visitorCompanySuggestions";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { detectCountryFromDevice } from "@/lib/detectCountry";
import { COUNTRY_FLAGS } from "@/lib/countryFlags";
import {
  PREREG_T,
  hasStoredLang,
  resolveInitialLang,
  storeLang,
  translateServerError,
  type Lang,
} from "@/lib/preregistroI18n";

type Company = { id: string; name: string };
type Office = { id: string; name: string; country: string };
type OfficeFacility = { id: string; name: string };
type Division = { id: string; company_id: string; name: string };
type VisitType = { id: string; name: string };
type FieldConfig = {
  id: string;
  kind: "builtin" | "custom";
  field_key: string;
  required: boolean;
  sort_order: number;
  label_es: string | null;
  label_en: string | null;
};

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
  facility: "",
  visitDate: "",
  visitTime: "",
};

// Fecha de HOY en la zona del dispositivo, no en UTC. Con toISOString()
// (UTC), a partir de las ~18:00 en México el "hoy" del formulario ya era
// el día siguiente: el campo de fecha ponía mañana como mínimo y un
// visitante no podía pre-registrarse para hoy mismo.
function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export default function PreRegistro() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [visitorCompanySuggestions, setVisitorCompanySuggestions] = useState<string[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  // Oficina a la que va este pre-registro. Se preselecciona sola con la
  // zona horaria del dispositivo (ver detectCountry.ts) para no tener que
  // repartir un link distinto por país, pero siempre se muestra cuál quedó
  // y se puede cambiar: mandar a alguien a la recepción equivocada en
  // silencio sería peor que preguntarle.
  const [officeId, setOfficeId] = useState("");
  const [officePickerOpen, setOfficePickerOpen] = useState(false);
  // Instalaciones de la oficina elegida (ej. Madrid: Envia.com,
  // Fulfillment) -- se piden aparte cada vez que cambia officeId, en vez de
  // traer las de todas las oficinas de golpe. El campo "¿A qué instalación
  // vas?" solo aparece si la oficina elegida tiene alguna registrada.
  const [officeFacilities, setOfficeFacilities] = useState<OfficeFacility[]>([]);
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(() => resolveInitialLang(null));
  // Solo se pregunta la primera vez que alguien entra desde este navegador
  // (sin idioma guardado todavía) — quien vuelve a entrar, o cambia de
  // idioma con el selector ES/EN de la esquina, ya no ve esta pantalla de
  // nuevo.
  const [langChosen, setLangChosen] = useState(() => hasStoredLang());
  const t = PREREG_T[lang];
  // Antes los 5 selects/sugerencias del formulario se quedaban vacíos
  // hasta que cada llamada a public-preregister resolvía por su cuenta, y
  // se iban "apareciendo de golpe" en momentos distintos según cada
  // respuesta -- se ve mejor mostrar un solo estado de carga hasta que las
  // 5 ya resolvieron (con o sin error) que dejar que el formulario se arme
  // a pedazos frente a la persona.
  const [dataReady, setDataReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  function changeLang(next: Lang) {
    setLang(next);
    storeLang(next);
  }

  function chooseInitialLang(next: Lang) {
    changeLang(next);
    setLangChosen(true);
  }

  // El campo "División" solo aparece si la empresa elegida tiene divisiones
  // registradas en la base de datos — nada hardcodeado a un nombre de
  // empresa en particular.
  const companyDivisions = divisions.filter((division) => division.company_id === form.companyId);
  const hasDivisions = companyDivisions.length > 0;
  // "¿A qué instalación vas?" en el pre-registro público solo aplica a
  // España (Envia.com/Fulfillment son direcciones realmente distintas).
  // Confirmado explícitamente: en México NO debe salir aquí, aunque
  // Monterrey también tenga instalaciones registradas para uso interno de
  // recepción (CheckIn.tsx) -- ese campo es aparte y no se toca.
  const selectedOfficeCountry = offices.find((office) => office.id === officeId)?.country;
  const hasOfficeFacilities = selectedOfficeCountry === "ES" && officeFacilities.length > 0;

  // Las 5 cargas van juntas y SÍ revisan el error de cada una. Antes cada
  // una hacía `data?.x ?? []` ignorando el error: si el backend respondía
  // 429 (basta con recargar la página unas cuantas veces, cada carga son 5
  // llamadas) o cualquier 5xx, el visitante terminaba con el formulario
  // armado pero con la lista de empresas VACÍA y obligatoria, sin ninguna
  // explicación de por qué no podía continuar.
  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setBootstrapError(false);

      const call = (action: string) =>
        supabase.functions.invoke("public-preregister", { body: { action } });

      const [companiesRes, divisionsRes, visitTypesRes, fieldsRes, officesRes] = await Promise.all([
        call("companies"),
        call("divisions"),
        call("visitTypes"),
        call("fieldConfig"),
        call("offices"),
      ]);

      if (cancelled) return;

      // "visitorCompanies" son solo sugerencias de autocompletado: si esa
      // falla el formulario sigue siendo perfectamente usable, así que no
      // cuenta como error de carga. Las otras cuatro sí.
      // "offices" queda fuera de esta lista a propósito: es la acción más
      // nueva del backend, y si el front se desplegara antes que la función
      // de borde, esa llamada respondería "Acción inválida" y tumbaría toda
      // la página pública. Sin oficinas simplemente no se muestra el
      // selector de recepción y el pre-registro sigue funcionando como antes.
      const failed = [companiesRes, divisionsRes, visitTypesRes, fieldsRes].some(
        (res) => res.error || res.data?.error || !res.data
      );

      if (failed) {
        setBootstrapError(true);
        setDataReady(true);
        return;
      }

      setCompanies(companiesRes.data.companies ?? []);
      setDivisions(divisionsRes.data.divisions ?? []);
      setVisitTypes(visitTypesRes.data.visitTypes ?? []);
      // Solo la lista común (paqueterías, proveedores frecuentes). Antes se
      // pedían al backend las empresas visitantes REALES del historial, y
      // esa acción era pública sin sesión: cualquiera en internet podía
      // listar a todo proveedor, cliente o candidato que haya pisado la
      // recepción. Recepción sí conserva las sugerencias aprendidas, porque
      // CheckIn.tsx las arma de su propia consulta ya autenticada.
      setVisitorCompanySuggestions(mergeVisitorCompanySuggestions([]));
      setFields(fieldsRes.data.fields ?? []);

      // Un solo link para todas las oficinas: aquí se resuelve cuál toca.
      // Prioridad: lo que venga en la URL (?oficina=madrid) para cuando se
      // quiera compartir un link ya dirigido, luego la zona horaria del
      // dispositivo, y si con eso no alcanza (o el país tiene más de una
      // oficina) se le pregunta al visitante.
      const activeOffices: Office[] = officesRes.data?.offices ?? [];
      setOffices(activeOffices);

      const requested = new URLSearchParams(window.location.search).get("oficina")?.toLowerCase();
      const fromUrl = requested
        ? activeOffices.find(
            (office) =>
              office.id === requested ||
              office.name.toLowerCase() === requested ||
              office.country.toLowerCase() === requested
          )
        : undefined;

      const detectedCountry = detectCountryFromDevice();
      const matchesDetected = detectedCountry
        ? activeOffices.filter((office) => office.country === detectedCountry)
        : [];

      const resolved = fromUrl ?? (matchesDetected.length === 1 ? matchesDetected[0] : undefined);

      if (resolved) {
        setOfficeId(resolved.id);
      } else if (activeOffices.length === 1) {
        setOfficeId(activeOffices[0].id);
      } else {
        setOfficePickerOpen(true);
      }

      setDataReady(true);
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    // Al cambiar de oficina se limpia la instalación elegida: las opciones
    // de una no aplican a la otra (Local 3/Envia.com en Monterrey no
    // significan lo mismo que Envia.com/Fulfillment en Madrid).
    setForm((f) => ({ ...f, facility: "" }));

    if (!officeId) {
      setOfficeFacilities([]);
      return;
    }
    let cancelled = false;
    supabase.functions
      .invoke("public-preregister", { body: { action: "officeFacilities", officeId } })
      .then(({ data }) => {
        if (!cancelled) setOfficeFacilities(data?.facilities ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [officeId]);

  // El return anticipado va DESPUÉS de todos los hooks de arriba (useState/
  // useEffect), nunca antes -- si estuviera antes, la primera vez que
  // alguien entra sin idioma guardado, React registraría 0 useEffect en ese
  // render; al elegir idioma y volver a renderizar SÍ se ejecutarían los 5
  // useEffect, un número distinto de hooks entre renders (viola las Reglas
  // de los Hooks) y React truena con un error que el ErrorBoundary global
  // atrapa como pantalla de "Recargar". Los useEffect de arriba igual
  // pueden ir cargando datos de fondo mientras se muestra esta pantalla;
  // para cuando se elige idioma, ya están listos o casi.
  if (!langChosen) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-6">
        <div className="card w-full max-w-sm p-8 text-center">
          <img src="/logo.png" alt="PassHub" className="mx-auto mb-6 h-14 w-auto" />
          <p className="mb-1 font-display text-lg font-bold text-ink">
            ¿En qué idioma prefieres continuar?
          </p>
          <p className="mb-6 text-sm text-ink-soft">Which language would you like to continue in?</p>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => chooseInitialLang("es")} className="btn-primary h-auto w-full py-2">
              Español
            </button>
            <button
              type="button"
              onClick={() => chooseInitialLang("en")}
              className="btn-secondary h-auto w-full py-2"
            >
              English
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!dataReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-6">
        <div className="card w-full max-w-sm p-8 text-center">
          <img src="/logo.png" alt="PassHub" className="mx-auto mb-6 h-14 w-auto" />
          <p className="text-sm text-ink-soft">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (bootstrapError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper p-6">
        <div className="card w-full max-w-sm p-8 text-center">
          <img src="/logo.png" alt="PassHub" className="mx-auto mb-6 h-14 w-auto" />
          <h1 className="font-display text-lg font-bold text-ink">{t.bootstrapErrorTitle}</h1>
          <p className="mt-2 text-sm text-ink-soft">{t.bootstrapErrorBody}</p>
          <button
            type="button"
            onClick={() => {
              setDataReady(false);
              setReloadKey((n) => n + 1);
            }}
            className="btn-primary mt-6 w-full"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  // Etiqueta de un campo configurable: usa el override que haya puesto el
  // admin (en el idioma activo) si existe, si no cae al texto por defecto
  // de esta pantalla (o, para campos "custom" sin traducción a un idioma,
  // al otro idioma antes que mostrar la clave interna).
  function fieldLabel(field: FieldConfig, fallback?: string) {
    const override = lang === "es" ? field.label_es : field.label_en;
    if (override && override.trim()) return override;
    if (fallback) return fallback;
    return field.label_es || field.label_en || field.field_key;
  }

  const sortedFields = [...fields].sort((a, b) => a.sort_order - b.sort_order);

  // Los campos "builtin" configurables (mostrar/ocultar, obligatorio,
  // orden) y los "custom" que haya agregado el admin se renderizan
  // intercalados según sort_order. visitorName, la empresa, división y
  // fecha/hora NO pasan por aquí — son fijos (ver JSX más abajo).
  function renderField(field: FieldConfig) {
    if (field.kind === "custom") {
      const label = fieldLabel(field);
      return (
        <div key={field.id}>
          <label className="mb-1 block text-sm font-medium text-ink-soft">{label}</label>
          <input
            type="text"
            required={field.required}
            value={customAnswers[field.field_key] ?? ""}
            onChange={(e) => setCustomAnswers({ ...customAnswers, [field.field_key]: e.target.value })}
            className="input-field h-auto py-2"
          />
        </div>
      );
    }

    switch (field.field_key) {
      case "visitorCompany":
        return (
          <div key={field.id}>
            <label htmlFor="visitorCompany" className="mb-1 block text-sm font-medium text-ink-soft">
              {fieldLabel(field, t.visitorCompany)}
            </label>
            <AutoCompleteInput
              id="visitorCompany"
              required={field.required}
              suggestions={visitorCompanySuggestions}
              value={form.visitorCompany}
              onChange={(visitorCompany) => setForm({ ...form, visitorCompany })}
              className="input-field h-auto py-2"
            />
          </div>
        );
      case "visitorPhone":
        return (
          <div key={field.id}>
            <label htmlFor="visitorPhone" className="mb-1 block text-sm font-medium text-ink-soft">
              {fieldLabel(field, t.visitorPhone)}
            </label>
            <input
              id="visitorPhone"
              type="tel"
              inputMode="numeric"
              required={field.required}
              value={form.visitorPhone}
              onChange={(e) => setForm({ ...form, visitorPhone: e.target.value.replace(/\D/g, "") })}
              className="input-field h-auto py-2"
            />
          </div>
        );
      case "visitorEmail":
        return (
          <div key={field.id}>
            <label htmlFor="visitorEmail" className="mb-1 block text-sm font-medium text-ink-soft">
              {fieldLabel(field, t.visitorEmail)}
            </label>
            <input
              id="visitorEmail"
              type="email"
              required={field.required}
              value={form.visitorEmail}
              onChange={(e) => setForm({ ...form, visitorEmail: e.target.value })}
              className="input-field h-auto py-2"
            />
          </div>
        );
      case "visitType":
        return (
          <div key={field.id} className="space-y-4">
            <div>
              <label htmlFor="visitType" className="mb-1 block text-sm font-medium text-ink-soft">
                {fieldLabel(field, t.visitType)}
              </label>
              <select
                id="visitType"
                required={field.required}
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
          </div>
        );
      case "hasVehicle":
        return (
          <div key={field.id} className="space-y-4">
            <div>
              <label htmlFor="hasVehicle" className="mb-1 block text-sm font-medium text-ink-soft">
                {fieldLabel(field, t.hasVehicle)}
              </label>
              <select
                id="hasVehicle"
                required={field.required}
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
          </div>
        );
      case "reason":
        return (
          <div key={field.id}>
            <label htmlFor="reason" className="mb-1 block text-sm font-medium text-ink-soft">
              {fieldLabel(field, t.reason)}
            </label>
            <input
              id="reason"
              type="text"
              required={field.required}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="input-field h-auto py-2"
            />
          </div>
        );
      default:
        return null;
    }
  }

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

    // Si hay más de una oficina activa, la del pre-registro no puede quedar
    // en blanco: sin ella, recepción no sabría a qué sede va esta visita.
    if (offices.length > 1 && !officeId) {
      setError(t.officeRequired);
      setOfficePickerOpen(true);
      return;
    }

    if (hasOfficeFacilities && !form.facility) {
      setError(t.facilityRequired);
      return;
    }

    setSubmitting(true);

    const { data, error: invokeError } = await supabase.functions.invoke("public-preregister", {
      body: { action: "create", ...form, officeId, visitType: resolvedVisitType, customAnswers },
    });

    setSubmitting(false);

    if (invokeError || data?.error) {
      const rawError = data?.error ?? (await edgeFunctionErrorMessage(invokeError, t.errorFallback));
      setError(translateServerError(rawError, lang));
      return;
    }

    // El chequeo de arriba deja pasar el caso "sin error pero sin datos"
    // (respuesta vacía o no-JSON): ahí data es null y leer data.token
    // tronaba toda la página pública con un TypeError, o navegaba a
    // /confirmation/undefined. Mejor mostrar el error normal del formulario.
    if (!data?.token) {
      setError(t.errorFallback);
      return;
    }

    navigate(`/pre-register/confirmation/${data.token}?lang=${lang}`);
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
        <p className="mb-4 text-sm text-ink-soft">{t.intro}</p>

        {/* Si la zona horaria (o el ?oficina= de la URL) ya resolvió una
            oficina sin ambigüedad, no se muestra nada aquí -- se toma sola
            y ya, sin preguntar ni mostrar un "Cambiar". Este bloque solo
            aparece cuando de verdad no se pudo resolver sola (país con más
            de una oficina detectada, o ninguna zona horaria conocida). */}
        {officePickerOpen && (
          <div className="mb-6 rounded-lg border border-line bg-paper p-3">
            <p className="mb-2 text-sm font-medium text-ink">{t.officeQuestion}</p>
            <div className="flex flex-wrap gap-2">
              {offices.map((office) => (
                <button
                  key={office.id}
                  type="button"
                  onClick={() => {
                    setOfficeId(office.id);
                    setOfficePickerOpen(false);
                  }}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    office.id === officeId
                      ? "border-accent bg-accent-tint text-accent"
                      : "border-line text-ink hover:border-accent"
                  }`}
                >
                  <span className="text-lg leading-none">{COUNTRY_FLAGS[office.country] ?? ""}</span>
                  {office.name}
                </button>
              ))}
            </div>
          </div>
        )}

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

          {sortedFields.map((field) => renderField(field))}

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

          {hasOfficeFacilities && (
            <div>
              <label htmlFor="facility" className="mb-1 block text-sm font-medium text-ink-soft">
                {t.facilityLabel}
              </label>
              <select
                id="facility"
                required
                value={form.facility}
                onChange={(e) => setForm({ ...form, facility: e.target.value })}
                className="input-field h-auto py-2"
              >
                <option value="" disabled></option>
                {officeFacilities.map((option) => (
                  <option key={option.id} value={option.name}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
