import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ClipboardList, History, Repeat2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { checkoutVisit } from "@/lib/checkout";
import { flagVisitor } from "@/lib/flaggedVisitors";
import { clearViewCache, coalesceViewRequest, readViewCache, writeViewCache } from "@/lib/viewCache";
import { Skeleton, TablePanelSkeleton, TableSkeletonRows } from "@/components/Skeleton";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { CollapsiblePanelGrid, PanelToggleButton } from "@/components/layout/CollapsiblePanelGrid";
import { usePanelVisibility } from "@/hooks/usePanelVisibility";
import { CountryFlag } from "@/components/CountryFlag";
import { DatePresetSelect } from "@/components/DatePresetSelect";
import { datePresetRange, type DatePreset } from "@/lib/datePresets";
import type { Tables } from "@/integrations/supabase/types";

type VisitRow = Pick<
  Tables<"visits">,
  | "id"
  | "folio"
  | "visitor_name"
  | "check_in_at"
  | "check_out_at"
  | "status"
  | "preregistration_id"
  | "visit_type"
  | "created_by_name"
  | "checked_out_by_name"
  | "facility"
> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
  offices: Pick<Tables<"offices">, "name" | "country"> | null;
};

type PreregRow = Pick<
  Tables<"visit_preregistrations">,
  "id" | "visitor_name" | "visit_date" | "status" | "used_at" | "extended_until" | "created_at"
> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
  companies: Pick<Tables<"companies">, "name"> | null;
};

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

// created_at es un timestamp en UTC; para filtrar "el día que se generó" con
// el sentido de un día de calendario LOCAL (no UTC), se calculan los límites
// del día local y se convierten a su equivalente UTC para comparar.
function localDayRangeUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

type Receptionist = { id: string; full_name: string };

const filterInputClass = "input-field h-auto w-full py-2 disabled:opacity-50";
const sideOptionClass = (active: boolean) =>
  `flex min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
    active ? "bg-accent-tint text-accent-dark" : "text-ink-soft hover:bg-paper hover:text-ink"
  }`;

type FrequencyRow = { name: string; count: number; lastVisit: string };

const VISIT_HEADERS = ["Folio", "Visitante", "A quién visita", "Instalación", "Tipo", "Registró", "Pre-registro", "Hora de entrada", "Hora de salida", "Marcó salida", "Estado", "Acciones"];
const PREREG_HEADERS = ["Visitante", "Visita a", "Fecha de visita", "Fecha de creación", "Entró", "Estado", "Vigente hasta", "Prórroga"];
const FREQUENCY_HEADERS = ["Visitante", "Veces que ha venido", "Última visita"];

function HistoryCompactCard({ title, subtitle, badge, fields, action }: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  fields: Array<{ label: string; value: ReactNode }>;
  action?: ReactNode;
}) {
  return (
    <article className="card min-w-0 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <h3 className="break-words font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 break-words text-xs text-ink-soft">{subtitle}</p>}
        </div>
        {badge}
      </div>
      <dl className="mt-4 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {fields.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-soft">{label}</dt>
            <dd className="mt-0.5 min-w-0 break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {action && <div className="mt-4 border-t border-line pt-3">{action}</div>}
    </article>
  );
}

function HistoryCompactSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:hidden" role="status" aria-label="Cargando resultados">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="card min-h-64 p-4">
          <div className="flex items-center justify-between border-b border-line pb-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-5 w-14 rounded-full" /></div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            {Array.from({ length: 6 }).map((__, field) => <div key={field} className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-24 max-w-full" /></div>)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Historial() {
  const { session, profile, isAdmin, isSuperadmin } = useAuth();
  const [view, setView] = useState<"visitas" | "preregistros" | "frecuencia">("visitas");
  const [period, setPeriod] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState(todayLocal());
  const [customTo, setCustomTo] = useState(todayLocal());
  const { from: dateFrom, to: dateTo } = datePresetRange(period, customFrom, customTo);
  const [dateField, setDateField] = useState<"visita" | "creacion">("visita");
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [creatorFilter, setCreatorFilter] = useState("");
  const [visitorNameInput, setVisitorNameInput] = useState("");
  const [visitorNameQuery, setVisitorNameQuery] = useState("");
  const visitsKey = JSON.stringify([dateFrom, dateTo, creatorFilter, visitorNameQuery, session?.user?.id, isAdmin, isSuperadmin, profile?.office_id]);
  const visitsCacheKey = `history:visits:${session?.user?.id ?? ""}:${visitsKey}`;
  const preregsKey = JSON.stringify([dateFrom, dateTo, dateField, visitorNameQuery]);
  const preregsCacheKey = `history:preregs:${session?.user?.id ?? ""}:${isSuperadmin}:${profile?.office_id ?? ""}:${preregsKey}`;
  const [visits, setVisits] = useState<VisitRow[]>(() => readViewCache<VisitRow[]>(visitsCacheKey)?.value ?? []);
  const [loading, setLoading] = useState(() => !readViewCache<VisitRow[]>(visitsCacheKey));
  const [loadedVisitsKey, setLoadedVisitsKey] = useState(() => readViewCache<VisitRow[]>(visitsCacheKey) ? visitsKey : "");
  const visitsRequestId = useRef(0);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<VisitRow | null>(null);
  const [checkoutFlagged, setCheckoutFlagged] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState("");
  const [preregs, setPreregs] = useState<PreregRow[]>(() => readViewCache<PreregRow[]>(preregsCacheKey)?.value ?? []);
  const [preregLoading, setPreregLoading] = useState(true);
  const [loadedPreregsKey, setLoadedPreregsKey] = useState("");
  const preregsRequestId = useRef(0);
  const [extensionDrafts, setExtensionDrafts] = useState<Record<string, string>>({});
  const [extensionSavingId, setExtensionSavingId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<FrequencyRow[]>([]);
  const [frequencyLoading, setFrequencyLoading] = useState(true);
  const [loadedFrequencyKey, setLoadedFrequencyKey] = useState("");
  const frequencyRequestId = useRef(0);
  const { visible: sidebarVisible, toggle: toggleSidebar } = usePanelVisibility();

  const frequencyKey = JSON.stringify([dateFrom, dateTo, visitorNameQuery]);
  const frequencyCacheKey = `history:frequency:${session?.user?.id ?? ""}:${isSuperadmin}:${profile?.office_id ?? ""}:${frequencyKey}`;
  const activeLoading = view === "visitas"
    ? loading || loadedVisitsKey !== visitsKey
    : view === "preregistros"
      ? preregLoading || loadedPreregsKey !== preregsKey
      : frequencyLoading || loadedFrequencyKey !== frequencyKey;

  useEffect(() => {
    // Solo admin puede filtrar por recepcionista, así que solo admin necesita
    // esta lista.
    if (!isAdmin) return;
    const key = `history:receptionists:${session?.user?.id ?? ""}`;
    const cached = readViewCache<Receptionist[]>(key);
    if (cached) setReceptionists(cached.value);
    if (cached?.fresh) return;
    void coalesceViewRequest(key, async () => await supabase
      .from("profiles")
      .select("id, full_name, user_roles(role)"))
      .then(({ data, error }) => {
        if (error) return;
        const list = (data ?? [])
          .filter((profile) => profile.user_roles?.some((r) => r.role === "recepcion"))
          .map((profile) => ({ id: profile.id, full_name: profile.full_name }));
        setReceptionists(list);
        writeViewCache(key, list);
      });
  }, [isAdmin, session?.user?.id]);

  useEffect(() => {
    const timeout = setTimeout(() => setVisitorNameQuery(visitorNameInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [visitorNameInput]);

  async function loadVisits(quiet = false) {
    if (!session?.user) return;

    const currentRequest = ++visitsRequestId.current;
    if (!quiet) setLoading(true);

    // Recepción ve todas las visitas, igual que admin — no solo las que
    // ella registró o cerró. RLS ya lo permite (visits_select no filtra
    // por dueño para admin/recepción/superadmin), esto solo confirma que
    // el frontend no le agrega una restricción de más.
    let query = supabase
      .from("visits")
      .select(
        "id, folio, visitor_name, check_in_at, check_out_at, status, preregistration_id, visit_type, created_by_name, checked_out_by_name, facility, employees(full_name), offices(name, country)"
      )
      .order("check_in_at", { ascending: false });

    if (dateFrom) query = query.gte("visit_date", dateFrom);
    if (dateTo) query = query.lte("visit_date", dateTo);

    if (isAdmin && creatorFilter) {
      query = query.eq("created_by", creatorFilter);
    }

    if (visitorNameQuery) {
      query = query.ilike("visitor_name", `%${visitorNameQuery}%`);
    }

    const { data, error } = await coalesceViewRequest(visitsCacheKey, async () => await query);
    if (currentRequest !== visitsRequestId.current) return;
    if (!error) {
      const rows = (data as VisitRow[] | null) ?? [];
      setVisits(rows);
      writeViewCache(visitsCacheKey, rows);
    }
    setLoadedVisitsKey(visitsKey);
    setLoading(false);
  }

  async function handleCheckout(visit: VisitRow) {
    if (!session?.user) {
      setCheckoutError("Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.");
      return;
    }
    setCheckoutError(null);

    const { error } = await checkoutVisit(visit.id, session.user.id);

    if (error) {
      console.error(error);
      setCheckoutError("No se pudo registrar la salida. Intenta de nuevo.");
      return;
    }

    if (checkoutFlagged) {
      const { error: flagError } = await flagVisitor({
        fullName: visit.visitor_name,
        note: checkoutNote,
        visitId: visit.id,
        flaggedBy: session.user.id,
      });
      if (flagError) console.error("No se pudo guardar la marca de comportamiento:", flagError);
    }

    setCheckoutFlagged(false);
    setCheckoutNote("");
    clearViewCache("dashboard:");
    clearViewCache("history:");
    void loadVisits(true);
  }

  useLayoutEffect(() => {
    const cached = readViewCache<VisitRow[]>(visitsCacheKey);
    if (cached) {
      visitsRequestId.current += 1;
      setVisits(cached.value);
      setLoadedVisitsKey(visitsKey);
      setLoading(false);
      if (cached.fresh) return;
    }
    void loadVisits(Boolean(cached));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, creatorFilter, visitorNameQuery, session?.user?.id, isAdmin, isSuperadmin, profile?.office_id]);

  async function loadPreregs(quiet = false) {
    const currentRequest = ++preregsRequestId.current;
    if (!quiet) setPreregLoading(true);

    // Esta vista es solo para admin: quiénes generaron un pre-registro,
    // hayan llegado a entrar o no (los que nunca se usan no aparecen en
    // "visits", porque ese registro solo se crea al hacer check-in).
    let query = supabase
      .from("visit_preregistrations")
      .select(
        "id, visitor_name, visit_date, status, used_at, extended_until, created_at, employees(full_name), companies(name)"
      )
      .order("visit_date", { ascending: false });

    if (dateField === "visita") {
      if (dateFrom) query = query.gte("visit_date", dateFrom);
      if (dateTo) query = query.lte("visit_date", dateTo);
    } else {
      if (dateFrom) query = query.gte("created_at", localDayRangeUtc(dateFrom).startIso);
      if (dateTo) query = query.lt("created_at", localDayRangeUtc(dateTo).endIso);
    }

    if (visitorNameQuery) {
      query = query.ilike("visitor_name", `%${visitorNameQuery}%`);
    }

    const { data, error } = await coalesceViewRequest(preregsCacheKey, async () => await query);
    if (currentRequest !== preregsRequestId.current) return;
    if (!error) {
      const rows = (data as PreregRow[] | null) ?? [];
      setPreregs(rows);
      writeViewCache(preregsCacheKey, rows);
    }
    setLoadedPreregsKey(preregsKey);
    setPreregLoading(false);
  }

  useLayoutEffect(() => {
    if (!isAdmin || view !== "preregistros") return;
    const cached = readViewCache<PreregRow[]>(preregsCacheKey);
    if (cached) {
      preregsRequestId.current += 1;
      setPreregs(cached.value);
      setLoadedPreregsKey(preregsKey);
      setPreregLoading(false);
      if (cached.fresh) return;
    }
    void loadPreregs(Boolean(cached));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isSuperadmin, profile?.office_id, view, dateFrom, dateTo, dateField, visitorNameQuery]);

  async function saveExtension(id: string, newExpiry: string) {
    setExtensionSavingId(id);
    const { error } = await supabase
      .from("visit_preregistrations")
      .update({ extended_until: newExpiry })
      .eq("id", id);
    setExtensionSavingId(null);

    if (error) {
      console.error(error);
      return;
    }

    setExtensionDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    clearViewCache("history:preregs:");
    void loadPreregs(true);
  }

  async function loadFrequency(quiet = false) {
    const currentRequest = ++frequencyRequestId.current;
    if (!quiet) setFrequencyLoading(true);

    // Cuenta visitas por nombre de visitante (normalizado: sin espacios ni
    // mayúsculas/minúsculas) para detectar visitantes recurrentes, desde el
    // inicio o acotado al periodo seleccionado.
    let query = supabase
      .from("visits")
      .select("visitor_name, check_in_at")
      .order("check_in_at", { ascending: false });

    if (dateFrom) query = query.gte("check_in_at", localDayRangeUtc(dateFrom).startIso);
    if (dateTo) query = query.lt("check_in_at", localDayRangeUtc(dateTo).endIso);

    if (visitorNameQuery) {
      query = query.ilike("visitor_name", `%${visitorNameQuery}%`);
    }

    const { data, error } = await coalesceViewRequest(frequencyCacheKey, async () => await query);
    if (currentRequest !== frequencyRequestId.current) return;
    if (error) {
      setFrequencyLoading(false);
      return;
    }

    const byName = new Map<string, FrequencyRow>();
    for (const row of data ?? []) {
      const key = row.visitor_name.trim().toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        existing.count += 1;
        if (row.check_in_at > existing.lastVisit) existing.lastVisit = row.check_in_at;
      } else {
        byName.set(key, { name: row.visitor_name.trim(), count: 1, lastVisit: row.check_in_at });
      }
    }

    const rows = Array.from(byName.values()).sort((a, b) => b.count - a.count);
    setFrequency(rows);
    writeViewCache(frequencyCacheKey, rows);
    setLoadedFrequencyKey(frequencyKey);
    setFrequencyLoading(false);
  }

  useLayoutEffect(() => {
    if (!isAdmin || view !== "frecuencia") return;
    const cached = readViewCache<FrequencyRow[]>(frequencyCacheKey);
    if (cached) {
      frequencyRequestId.current += 1;
      setFrequency(cached.value);
      setLoadedFrequencyKey(frequencyKey);
      setFrequencyLoading(false);
      if (cached.fresh) return;
    }
    void loadFrequency(Boolean(cached));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, isSuperadmin, profile?.office_id, view, dateFrom, dateTo, visitorNameQuery]);

  return (
    <PageShell>
      <PageHeader
        title="Historial de visitas"
        description={isAdmin ? "Todas las empresas y recepcionistas." : "Todas las visitas, sin importar quién las registró."}
      />

      <CollapsiblePanelGrid open={sidebarVisible} onToggle={toggleSidebar} id="history-sidebar" label="Opciones de historial" aside={<div className="space-y-4">
          {isAdmin && (
            <section className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">Vista</h2>
                <PanelToggleButton open onToggle={toggleSidebar} controls="history-sidebar" />
              </div>
              <div className="grid gap-2">
                {([
                  { value: "visitas", label: "Visitas", icon: History },
                  { value: "preregistros", label: "Pre-registros", icon: ClipboardList },
                  { value: "frecuencia", label: "Frecuencia", icon: Repeat2 },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setView(value)}
                    aria-pressed={view === value}
                    className={sideOptionClass(view === value)}
                  >
                    <Icon size={16} aria-hidden="true" className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">Consultar</h2>
          {!isAdmin && <PanelToggleButton open onToggle={toggleSidebar} controls="history-sidebar" />}
        </div>
      <div className="grid gap-4">
        <div>
          <label htmlFor="historialPeriod" className="mb-1 block text-xs font-medium text-ink-soft">Periodo</label>
          <DatePresetSelect id="historialPeriod" value={period} onChange={setPeriod} className={filterInputClass} />
        </div>
        {period === "custom" && <>
          <div>
            <label htmlFor="historialFrom" className="mb-1 block text-xs font-medium text-ink-soft">Desde</label>
            <input id="historialFrom" type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className={filterInputClass} />
          </div>
          <div>
            <label htmlFor="historialTo" className="mb-1 block text-xs font-medium text-ink-soft">Hasta</label>
            <input id="historialTo" type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className={filterInputClass} />
          </div>
        </>}

        {view === "preregistros" && (
          <div>
            <label htmlFor="historialDateField" className="mb-1 block text-xs font-medium text-ink-soft">
              Filtrar por
            </label>
            <select
              id="historialDateField"
              value={dateField}
              onChange={(e) => setDateField(e.target.value as "visita" | "creacion")}
              className={filterInputClass}
            >
              <option value="visita">Fecha de visita</option>
              <option value="creacion">Fecha de creación</option>
            </select>
          </div>
        )}

        {isAdmin && view === "visitas" && (
          <div>
            <label htmlFor="historialCreator" className="mb-1 block text-xs font-medium text-ink-soft">
              Recepción
            </label>
            <select
              id="historialCreator"
              value={creatorFilter}
              onChange={(e) => setCreatorFilter(e.target.value)}
              className={filterInputClass}
            >
              <option value="">Todas</option>
              {receptionists.map((receptionist) => (
                <option key={receptionist.id} value={receptionist.id}>
                  {receptionist.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="historialVisitorName" className="mb-1 block text-xs font-medium text-ink-soft">
            Nombre del visitante
          </label>
          <input
            id="historialVisitorName"
            type="text"
            placeholder="Escribe para buscar..."
            value={visitorNameInput}
            onChange={(e) => setVisitorNameInput(e.target.value)}
            className={filterInputClass}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setPeriod("today");
            setCustomFrom(todayLocal());
            setCustomTo(todayLocal());
            setDateField("visita");
            setCreatorFilter("");
            setVisitorNameInput("");
          }}
          className="w-fit text-sm font-medium text-ink-soft underline hover:text-ink"
        >
          Borrar filtros
        </button>
      </div>
      </section>

        </div>}>
        <div>

      {activeLoading ? <>
        <HistoryCompactSkeleton />
        <div className="hidden xl:block"><TablePanelSkeleton headers={view === "visitas" ? VISIT_HEADERS : view === "preregistros" ? PREREG_HEADERS : FREQUENCY_HEADERS} width={view === "visitas" ? "visits" : view === "preregistros" ? "preregs" : "auto"} /></div>
      </> : view === "frecuencia" ? (<>
        <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
          {frequency.length === 0 && <div className="card col-span-full flex min-h-64 items-center justify-center p-4 text-center text-sm text-ink-soft">No hay visitas que coincidan con estos filtros.</div>}
          {frequency.map((row) => <HistoryCompactCard key={row.name.toLowerCase()} title={row.name} fields={[
            { label: "Veces que ha venido", value: `${row.count} ${row.count === 1 ? "vez" : "veces"}` },
            { label: "Última visita", value: new Date(row.lastVisit).toLocaleDateString() },
          ]} />)}
        </div>
        <div className="card hidden min-h-80 overflow-x-auto p-0 xl:block">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="tbl-head border-b border-line text-ink-soft">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Visitante</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Veces que ha venido</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Última visita</th>
              </tr>
            </thead>
            <tbody>
              {frequencyLoading && <TableSkeletonRows rows={5} columns={3} />}
              {!frequencyLoading && frequency.length === 0 && (
                <tr>
                  <td colSpan={3} className="h-64 px-4 py-6 text-center align-middle text-ink-soft">
                    No hay visitas que coincidan con estos filtros.
                  </td>
                </tr>
              )}
              {frequency.map((row) => (
                <tr key={row.name.toLowerCase()} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {row.count} {row.count === 1 ? "vez" : "veces"}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {new Date(row.lastVisit).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></>
      ) : view === "visitas" ? (
        <div>
          {checkoutError && <p className="mb-3 text-sm text-danger">{checkoutError}</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
            {visits.length === 0 && <div className="card col-span-full flex min-h-64 items-center justify-center p-4 text-center text-sm text-ink-soft">No hay visitas que coincidan con estos filtros.</div>}
            {visits.map((visit) => <HistoryCompactCard
              key={visit.id}
              title={visit.visitor_name}
              subtitle={visit.folio ?? undefined}
              badge={<span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${visit.status === "dentro" ? "bg-accent-tint text-accent-dark" : "bg-line text-ink-soft"}`}>{visit.status === "dentro" ? "Dentro" : "Fuera"}</span>}
              fields={[
                { label: "A quién visita", value: visit.employees?.full_name ?? "—" },
                { label: "Instalación", value: <>{visit.offices?.country && <CountryFlag code={visit.offices.country} className="mr-1 h-3 w-[18px]" />}{visit.facility ?? "—"}</> },
                { label: "Tipo", value: visit.visit_type ?? "—" },
                { label: "Registró", value: visit.created_by_name ?? "—" },
                { label: "Pre-registro", value: visit.preregistration_id ? "Sí" : "No" },
                { label: "Entrada", value: formatTime(visit.check_in_at) },
                { label: "Salida", value: formatTime(visit.check_out_at) },
                { label: "Marcó salida", value: visit.checked_out_by_name ?? "—" },
              ]}
              action={visit.status === "dentro" ? <button type="button" onClick={() => setCheckoutTarget(visit)} className="text-sm font-medium text-accent hover:text-accent-dark">Registrar salida</button> : undefined}
            />)}
          </div>
          <div className="card hidden min-h-80 overflow-x-auto p-0 xl:block">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead>
              <tr className="tbl-head border-b border-line text-ink-soft">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Folio</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Visitante</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">A quién visita</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Instalación</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Tipo</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Registró</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Pre-registro</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Hora de entrada</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Hora de salida</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Marcó salida</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Estado</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <TableSkeletonRows rows={5} columns={12} />}
              {!loading && visits.length === 0 && (
                <tr>
                  <td colSpan={12} className="h-64 px-4 py-6 text-center align-middle text-ink-soft">
                    No hay visitas que coincidan con estos filtros.
                  </td>
                </tr>
              )}
              {visits.map((visit) => (
                <tr key={visit.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{visit.folio}</td>
                  <td className="px-4 py-3 text-ink">{visit.visitor_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{visit.employees?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {visit.facility ? (
                      <>
                        {visit.offices?.country && (
                          <CountryFlag code={visit.offices.country} className="mr-1 h-3 w-[18px]" />
                        )}
                        {visit.facility}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{visit.visit_type ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{visit.created_by_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        visit.preregistration_id
                          ? "bg-accent-tint text-accent-dark"
                          : "bg-line text-ink-soft"
                      }`}
                    >
                      {visit.preregistration_id ? "Sí" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{formatTime(visit.check_in_at)}</td>
                  <td className="px-4 py-3 text-ink-soft">{formatTime(visit.check_out_at)}</td>
                  <td className="px-4 py-3 text-ink-soft">{visit.checked_out_by_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        visit.status === "dentro"
                          ? "bg-accent-tint text-accent-dark"
                          : "bg-line text-ink-soft"
                      }`}
                    >
                      {visit.status === "dentro" ? "Dentro" : "Fuera"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {visit.status === "dentro" ? (
                      <button
                        type="button"
                        onClick={() => setCheckoutTarget(visit)}
                        className="whitespace-nowrap text-sm font-medium text-accent hover:text-accent-dark"
                      >
                        Registrar salida
                      </button>
                    ) : (
                      <span className="text-sm text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <div>
          <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
            {preregs.length === 0 && <div className="card col-span-full flex min-h-64 items-center justify-center p-4 text-center text-sm text-ink-soft">No hay pre-registros que coincidan con estos filtros.</div>}
            {preregs.map((prereg) => {
              const expiresOn = prereg.extended_until ?? addDays(prereg.visit_date, 7);
              const draft = extensionDrafts[prereg.id] ?? expiresOn;
              return <HistoryCompactCard
                key={prereg.id}
                title={prereg.visitor_name}
                badge={<span className="shrink-0 rounded-full bg-line px-2 py-1 text-xs font-medium text-ink-soft">{prereg.status === "cancelada" ? "Cancelado" : todayLocal() > expiresOn ? "Vencido" : "Vigente"}</span>}
                fields={[
                  { label: "Visita a", value: <>{prereg.employees?.full_name ?? "—"}{prereg.companies?.name ? ` · ${prereg.companies.name}` : ""}</> },
                  { label: "Fecha de visita", value: formatDate(prereg.visit_date) },
                  { label: "Fecha de creación", value: new Date(prereg.created_at).toLocaleDateString() },
                  { label: "Entró", value: prereg.status === "usada" ? "Sí" : "No" },
                  { label: "Vigente hasta", value: formatDate(expiresOn) },
                ]}
                action={isAdmin ? <div className="flex flex-wrap items-center gap-2"><label className="text-xs text-ink-soft" htmlFor={`prereg-extension-${prereg.id}`}>Prórroga</label><input id={`prereg-extension-${prereg.id}`} type="date" value={draft} onChange={(e) => setExtensionDrafts((prev) => ({ ...prev, [prereg.id]: e.target.value }))} className="input-field h-auto min-w-0 py-1 text-xs" /><button type="button" disabled={extensionSavingId === prereg.id || draft === expiresOn} onClick={() => saveExtension(prereg.id, draft)} className="text-xs font-medium text-accent hover:text-accent-dark disabled:opacity-50">Guardar</button></div> : undefined}
              />;
            })}
          </div>
          <div className="card hidden min-h-80 overflow-x-auto p-0 xl:block">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="tbl-head border-b border-line text-ink-soft">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Visitante</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Visita a</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Fecha de visita</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Fecha de creación</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Entró</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Estado</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Vigente hasta</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Prórroga</th>
              </tr>
            </thead>
            <tbody>
              {preregLoading && <TableSkeletonRows rows={5} columns={8} />}
              {!preregLoading && preregs.length === 0 && (
                <tr>
                  <td colSpan={8} className="h-64 px-4 py-6 text-center align-middle text-ink-soft">
                    No hay pre-registros que coincidan con estos filtros.
                  </td>
                </tr>
              )}
              {preregs.map((prereg) => {
                const expiresOn = prereg.extended_until ?? addDays(prereg.visit_date, 7);
                const expired = todayLocal() > expiresOn;
                const draft = extensionDrafts[prereg.id] ?? expiresOn;

                return (
                  <tr key={prereg.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{prereg.visitor_name}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {prereg.employees?.full_name ?? "—"}
                      {prereg.companies?.name ? ` · ${prereg.companies.name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{formatDate(prereg.visit_date)}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {new Date(prereg.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          prereg.status === "usada"
                            ? "bg-accent-tint text-accent-dark"
                            : "bg-line text-ink-soft"
                        }`}
                      >
                        {prereg.status === "usada" ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {prereg.status === "cancelada"
                        ? "Cancelado"
                        : expired
                          ? "Vencido"
                          : "Vigente"}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{formatDate(expiresOn)}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={draft}
                            onChange={(e) =>
                              setExtensionDrafts((prev) => ({ ...prev, [prereg.id]: e.target.value }))
                            }
                            className="rounded-md border border-line bg-card px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={extensionSavingId === prereg.id || draft === expiresOn}
                            onClick={() => saveExtension(prereg.id, draft)}
                            className="text-xs font-medium text-accent hover:text-accent-dark disabled:opacity-50"
                          >
                            Guardar
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

        </div>
      </CollapsiblePanelGrid>

      <ConfirmDialog
        open={!!checkoutTarget}
        title="¿Registrar la salida de este visitante?"
        message={checkoutTarget ? `Se registrará la salida de ${checkoutTarget.visitor_name}.` : undefined}
        onConfirm={async () => {
          if (checkoutTarget) await handleCheckout(checkoutTarget);
          setCheckoutTarget(null);
        }}
        onCancel={() => {
          setCheckoutTarget(null);
          setCheckoutFlagged(false);
          setCheckoutNote("");
        }}
      >
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={checkoutFlagged}
            onChange={(e) => setCheckoutFlagged(e.target.checked)}
            className="mt-0.5"
          />
          <span>¿Esta persona tuvo un comportamiento violento/hostil?</span>
        </label>
        {checkoutFlagged && (
          <textarea
            value={checkoutNote}
            onChange={(e) => setCheckoutNote(e.target.value)}
            placeholder="Nota (opcional) — qué pasó"
            rows={2}
            className="input-field mt-2 h-auto w-full py-2 text-sm"
          />
        )}
      </ConfirmDialog>
    </PageShell>
  );
}
