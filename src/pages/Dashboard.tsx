import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CalendarDays, History, RefreshCw, UserPlus, UsersRound } from "lucide-react";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { CollapsiblePanelGrid, PanelToggleButton } from "@/components/layout/CollapsiblePanelGrid";
import { usePanelVisibility } from "@/hooks/usePanelVisibility";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AnalyticsSection } from "@/components/analytics/AnalyticsSection";
import { checkoutVisit } from "@/lib/checkout";
import { flagVisitor } from "@/lib/flaggedVisitors";
import { clearViewCache, coalesceViewRequest, readViewCache, writeViewCache } from "@/lib/viewCache";
import { PanelContentSkeleton, Skeleton } from "@/components/Skeleton";
import { DatePresetSelect } from "@/components/DatePresetSelect";
import { datePresetRange, localDateToday, type DatePreset } from "@/lib/datePresets";
import type { Tables } from "@/integrations/supabase/types";

type VisitRow = Pick<
  Tables<"visits">,
  | "id"
  | "folio"
  | "visitor_name"
  | "check_in_at"
  | "check_out_at"
  | "status"
  | "company_id"
  | "created_by_name"
  | "checked_out_by_name"
> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
};

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export default function Dashboard() {
  const { session, profile, isSuperadmin } = useAuth();
  const [viewMode, setViewMode] = useState<"fecha" | "dentro" | "analiticas">("fecha");
  const [period, setPeriod] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState(localDateToday());
  const [customTo, setCustomTo] = useState(localDateToday());
  const { from: dateFrom, to: dateTo } = datePresetRange(period, customFrom, customTo);
  const periodKey = `${viewMode}:${dateFrom}:${dateTo}`;
  const cacheKey = `dashboard:${session?.user?.id ?? ""}:${isSuperadmin}:${profile?.office_id ?? ""}:${periodKey}`;
  const [visits, setVisits] = useState<VisitRow[]>(() => readViewCache<VisitRow[]>(cacheKey)?.value ?? []);
  const [loading, setLoading] = useState(() => !readViewCache<VisitRow[]>(cacheKey));
  const [loadedKey, setLoadedKey] = useState(() => readViewCache<VisitRow[]>(cacheKey) ? periodKey : "");
  const requestId = useRef(0);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<VisitRow | null>(null);
  const [checkoutFlagged, setCheckoutFlagged] = useState(false);
  const [checkoutNote, setCheckoutNote] = useState("");
  const { visible: sidebarVisible, toggle: toggleSidebar } = usePanelVisibility();

  async function loadVisits(quiet = false) {
    if (viewMode === "analiticas") return;

    const currentRequest = ++requestId.current;
    const key = periodKey;
    if (!quiet) setLoading(true);
    
    let query = supabase
      .from("visits")
      .select(
        "id, folio, visitor_name, check_in_at, check_out_at, status, company_id, created_by_name, checked_out_by_name, employees(full_name)"
      )
      .order("check_in_at", { ascending: false });

    if (viewMode === "fecha") {
      if (dateFrom) query = query.gte("visit_date", dateFrom);
      if (dateTo) query = query.lte("visit_date", dateTo);
    } else {
      query = query.eq("status", "dentro");
    }

    const { data, error } = await coalesceViewRequest(cacheKey, async () => await query);
    if (currentRequest !== requestId.current) return;
    if (!error) {
      const rows = (data as VisitRow[] | null) ?? [];
      setVisits(rows);
      writeViewCache(cacheKey, rows);
    }
    setLoadedKey(key);
    setLoading(false);
  }

  useLayoutEffect(() => {
    if (viewMode === "analiticas") {
      requestId.current += 1;
      return;
    }
    const cached = readViewCache<VisitRow[]>(cacheKey);
    if (cached) {
      requestId.current += 1;
      setVisits(cached.value);
      setLoadedKey(periodKey);
      setLoading(false);
      if (cached.fresh) return;
    }
    void loadVisits(Boolean(cached));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, dateFrom, dateTo, session?.user?.id, isSuperadmin, profile?.office_id]);

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
    await loadVisits(true);
  }

  const insideCount = visits.filter((visit) => visit.status === "dentro").length;
  const companiesActive = new Set(visits.map((visit) => visit.company_id)).size;
  const showSkeleton = loading || loadedKey !== periodKey;

  return (
    <PageShell>
      <PageHeader title="Panel de control" description="Visitas, movimientos y accesos rápidos en un solo lugar." />

      <CollapsiblePanelGrid open={sidebarVisible} onToggle={toggleSidebar} id="dashboard-sidebar" label="Opciones del panel" aside={<div className="space-y-4">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">Vista</h2>
              <PanelToggleButton open onToggle={toggleSidebar} controls="dashboard-sidebar" />
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              {([
                { value: "fecha", label: "Por periodo", icon: CalendarDays },
                { value: "dentro", label: "Visitantes dentro", icon: UsersRound },
                { value: "analiticas", label: "Analíticas", icon: BarChart3 },
              ] as const).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setViewMode(value)}
                  aria-pressed={viewMode === value}
                  className={`flex min-w-0 items-center justify-center gap-2 rounded-lg px-2 py-2.5 text-xs font-medium transition-colors sm:text-sm xl:justify-start xl:px-3 ${
                    viewMode === value
                      ? "bg-accent-tint text-accent-dark"
                      : "text-ink-soft hover:bg-paper hover:text-ink"
                  }`}
                >
                  <Icon size={16} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card min-h-[10.5rem] p-4">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-soft">Consultar</h2>
            {viewMode === "analiticas" ? (
              <p className="text-sm leading-relaxed text-ink-soft">Elige el periodo encima de las gráficas.</p>
            ) : (
              <>
                {viewMode === "fecha" && (
                  <div className="mb-3 space-y-3">
                    <div>
                      <label htmlFor="dashboardPeriod" className="mb-1 block text-xs font-medium text-ink-soft">Periodo de visitas</label>
                      <DatePresetSelect id="dashboardPeriod" value={period} onChange={setPeriod} />
                    </div>
                    {period === "custom" && <>
                      <label className="block text-xs font-medium text-ink-soft">Desde
                        <input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} className="input-field mt-1 h-auto w-full py-2" />
                      </label>
                      <label className="block text-xs font-medium text-ink-soft">Hasta
                        <input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} className="input-field mt-1 h-auto w-full py-2" />
                      </label>
                    </>}
                  </div>
                )}
                {viewMode === "dentro" && (
                  <p className="mb-3 text-sm text-ink-soft">Visitas activas en este momento.</p>
                )}
                <button type="button" onClick={() => void loadVisits(true)} className="btn-secondary flex w-full items-center justify-center gap-2">
                  <RefreshCw size={16} aria-hidden="true" />
                  Actualizar visitas
                </button>
              </>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-soft">Accesos rápidos</h2>
            <nav className="space-y-1 text-sm" aria-label="Accesos rápidos">
              <Link to="/" className="flex items-center gap-2 rounded-lg px-2 py-2 text-ink hover:bg-paper">
                <UserPlus size={16} aria-hidden="true" /> Registrar visita
              </Link>
              <Link to="/history" className="flex items-center gap-2 rounded-lg px-2 py-2 text-ink hover:bg-paper">
                <History size={16} aria-hidden="true" /> Historial
              </Link>
              <Link to="/employees" className="flex items-center gap-2 rounded-lg px-2 py-2 text-ink hover:bg-paper">
                <UsersRound size={16} aria-hidden="true" /> Colaboradores
              </Link>
              <Link to="/catalogs" className="flex items-center gap-2 rounded-lg px-2 py-2 text-ink hover:bg-paper">
                <BarChart3 size={16} aria-hidden="true" /> Catálogos
              </Link>
            </nav>
          </section>
        </div>}>
        <div className="space-y-5">
          {viewMode === "analiticas" ? (
            <AnalyticsSection />
          ) : (
            <>
              <div className={`grid gap-4 ${viewMode === "fecha" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                {viewMode === "fecha" && (
                  <div className="card min-w-0 min-h-28 p-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Visitas en el periodo</p>
                    {showSkeleton ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="mt-2 font-display text-3xl font-bold text-ink">{visits.length}</p>}
                  </div>
                )}
                <div className="min-h-28 rounded-lg border border-accent bg-accent-tint p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-accent-dark">Visitantes dentro</p>
                  {showSkeleton ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="mt-2 font-display text-3xl font-bold text-accent-dark">{viewMode === "dentro" ? visits.length : insideCount}</p>}
                </div>
                <div className="card min-w-0 min-h-28 p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Empresas con actividad</p>
                  {showSkeleton ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="mt-2 font-display text-3xl font-bold text-ink">{companiesActive}</p>}
                </div>
              </div>

              {checkoutError && <p role="alert" className="text-sm text-danger">{checkoutError}</p>}

              {showSkeleton ? <PanelContentSkeleton /> : <section className="card min-h-80 overflow-hidden p-0" aria-label="Actividad de visitas">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-4 sm:px-5">
                  <div>
                    <h2 className="font-display text-lg font-bold text-ink">
                      {viewMode === "fecha" ? "Actividad del periodo" : "Visitantes dentro"}
                    </h2>
                    <p className="text-xs text-ink-soft">
                      {viewMode === "fecha" ? (period === "all" ? "Todos los movimientos" : `Movimientos del ${dateFrom}${dateFrom !== dateTo ? ` al ${dateTo}` : ""}`) : "Visitas que siguen activas"}
                    </p>
                  </div>
                  <span className="rounded-full bg-accent-tint px-3 py-1 text-xs font-semibold text-accent-dark">
                    {visits.length} {visits.length === 1 ? "visita" : "visitas"}
                  </span>
                </div>

                {visits.length === 0 && (
                  <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
                    <p className="font-medium text-ink">Sin visitas por mostrar</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {viewMode === "fecha"
                        ? "No hay visitas registradas para este periodo."
                        : "No hay visitantes dentro en este momento."}
                    </p>
                  </div>
                )}
                {visits.map((visit) => (
                  <article key={visit.id} className="border-b border-line p-4 last:border-0 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-tint font-display text-sm font-bold text-accent-dark">
                          {initialOf(visit.visitor_name)}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-ink">{visit.visitor_name}</h3>
                          <p className="text-xs text-ink-soft">{visit.folio}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          visit.status === "dentro" ? "bg-accent-tint text-accent-dark" : "bg-line text-ink-soft"
                        }`}>
                          {visit.status === "dentro" ? "Dentro" : "Fuera"}
                        </span>
                        {visit.status === "dentro" && (
                          <button
                            type="button"
                            onClick={() => setCheckoutTarget(visit)}
                            className="text-sm font-semibold text-accent hover:text-accent-dark"
                          >
                            Registrar salida
                          </button>
                        )}
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div><dt className="text-xs text-ink-soft">A quién visita</dt><dd className="mt-0.5 font-medium text-ink">{visit.employees?.full_name ?? "—"}</dd></div>
                      <div><dt className="text-xs text-ink-soft">Entrada</dt><dd className="mt-0.5 font-medium text-ink">{formatTime(visit.check_in_at)}</dd></div>
                      <div><dt className="text-xs text-ink-soft">Salida</dt><dd className="mt-0.5 font-medium text-ink">{formatTime(visit.check_out_at)}</dd></div>
                      <div><dt className="text-xs text-ink-soft">Registró</dt><dd className="mt-0.5 text-ink">{visit.created_by_name ?? "—"}</dd></div>
                      {visit.checked_out_by_name && (
                        <div><dt className="text-xs text-ink-soft">Marcó salida</dt><dd className="mt-0.5 text-ink">{visit.checked_out_by_name}</dd></div>
                      )}
                    </dl>
                  </article>
                ))}
              </section>}
            </>
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
