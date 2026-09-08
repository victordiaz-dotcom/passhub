import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";

// Grid de fondo de las gráficas: no es un color "de dato", así que no se
// expone en el personalizador — se mantiene fijo al token `line`.
const GRID_STROKE = "#e9e9e9";

type ChartColors = {
  accent: string;
  accentDark: string;
  warn: string;
  danger: string;
  inkSoft: string;
};

// Mismos valores que los tokens de tailwind.config.ts (accent, accent-dark,
// warn, danger, ink-soft) — son el punto de partida y lo que "Restaurar
// colores por defecto" recupera; el usuario puede personalizarlos desde la
// interfaz (persisten en localStorage, por navegador).
const DEFAULT_CHART_COLORS: ChartColors = {
  accent: "#1873dc",
  accentDark: "#0e4381",
  warn: "#ff9800",
  danger: "#f44336",
  inkSoft: "#6c757d",
};

const CHART_COLORS_STORAGE_KEY = "passhub_analytics_chart_colors";

function loadStoredChartColors(): ChartColors {
  try {
    const raw = localStorage.getItem(CHART_COLORS_STORAGE_KEY);
    if (!raw) return DEFAULT_CHART_COLORS;
    return { ...DEFAULT_CHART_COLORS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CHART_COLORS;
  }
}

const COLOR_FIELDS: { key: keyof ChartColors; label: string }[] = [
  { key: "accent", label: "Principal (entradas, empresas, horarios)" },
  { key: "accentDark", label: "Secundario (colaboradores)" },
  { key: "warn", label: "Pre-registro pendiente" },
  { key: "danger", label: "Pre-registro vencida" },
  { key: "inkSoft", label: "Pre-registro cancelada" },
];

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  usada: "Usada (check-in)",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function monthsAgoStart(months: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// Mismo enfoque que localDayRangeUtc en Historial.tsx (calendario local
// convertido a UTC para comparar contra timestamptz), pero para un rango de
// fechas en vez de un solo día: el final es exclusivo, el día siguiente al
// "hasta" elegido.
function localRangeToUtc(fromDate: string, toDate: string) {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
  const end = new Date(ty, tm - 1, td + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function monthSpine(fromDate: string, toDate: string) {
  const [fy, fm] = fromDate.split("-").map(Number);
  const [ty, tm] = toDate.split("-").map(Number);
  const keys: string[] = [];
  let y = fy;
  let m = fm - 1;
  const endKey = `${ty}-${String(tm).padStart(2, "0")}`;
  for (let i = 0; i < 60; i++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    keys.push(key);
    if (key === endKey) break;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return keys;
}

type MonthlyPoint = { month: string; visits: number };
type NamedCount = { name: string; visits: number };
type StatusCount = { status: string; label: string; visits: number };
type HourPoint = { hour: string; visits: number };
type WeekdayPoint = { day: string; visits: number };

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-56 items-center justify-center text-sm text-ink-soft">{message}</div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
      <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
        {title}
      </h3>
      {children}
    </div>
  );
}

export function AnalyticsSection() {
  const [fromDate, setFromDate] = useState(monthsAgoStart(5));
  const [toDate, setToDate] = useState(todayLocal());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [topCompanies, setTopCompanies] = useState<NamedCount[]>([]);
  const [topHosts, setTopHosts] = useState<NamedCount[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<StatusCount[]>([]);
  const [byHour, setByHour] = useState<HourPoint[]>([]);
  const [byWeekday, setByWeekday] = useState<WeekdayPoint[]>([]);
  const [comparison, setComparison] = useState<{ current: number; previous: number } | null>(null);

  const [chartColors, setChartColors] = useState<ChartColors>(loadStoredChartColors);
  const [showColorSettings, setShowColorSettings] = useState(false);

  const statusColorMap: Record<string, string> = {
    pendiente: chartColors.warn,
    usada: chartColors.accent,
    vencida: chartColors.danger,
    cancelada: chartColors.inkSoft,
  };

  function updateChartColor(key: keyof ChartColors, value: string) {
    setChartColors((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(CHART_COLORS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage puede fallar (modo privado, cuota); el cambio se
        // sigue aplicando en esta sesión aunque no persista.
      }
      return next;
    });
  }

  function resetChartColors() {
    setChartColors(DEFAULT_CHART_COLORS);
    try {
      localStorage.removeItem(CHART_COLORS_STORAGE_KEY);
    } catch {
      // ver comentario en updateChartColor
    }
  }

  async function loadAll() {
    setLoading(true);
    setError(null);

    const { startIso, endIso } = localRangeToUtc(fromDate, toDate);
    // La comparativa "mes actual vs anterior" es un concepto fijo (el mes de
    // calendario en curso), independiente del rango elegido para las demás
    // gráficas — así que se pide aparte, siempre con los últimos ~2 meses.
    const comparisonRange = localRangeToUtc(monthsAgoStart(1), todayLocal());

    const [monthlyRes, companiesRes, hostsRes, statusRes, hourRes, weekdayRes, comparisonRes] =
      await Promise.all([
        supabase.rpc("analytics_visits_by_month", { p_start: startIso, p_end: endIso }),
        supabase.rpc("analytics_top_visitor_companies", {
          p_start: startIso,
          p_end: endIso,
          p_limit: 10,
        }),
        supabase.rpc("analytics_top_hosts", { p_start: startIso, p_end: endIso, p_limit: 10 }),
        supabase.rpc("analytics_prereg_status_breakdown", { p_start: startIso, p_end: endIso }),
        supabase.rpc("analytics_visits_by_hour", { p_start: startIso, p_end: endIso }),
        supabase.rpc("analytics_visits_by_weekday", { p_start: startIso, p_end: endIso }),
        supabase.rpc("analytics_visits_by_month", {
          p_start: comparisonRange.startIso,
          p_end: comparisonRange.endIso,
        }),
      ]);

    const firstError =
      monthlyRes.error ||
      companiesRes.error ||
      hostsRes.error ||
      statusRes.error ||
      hourRes.error ||
      weekdayRes.error ||
      comparisonRes.error;

    if (firstError) {
      console.error(firstError);
      setError("No se pudieron cargar las analíticas. Intenta de nuevo.");
      setLoading(false);
      return;
    }

    // Entradas por mes: se completan los meses sin visitas con 0 en vez de
    // dejarlos fuera (group by solo devuelve meses con al menos una fila),
    // para que la gráfica no tenga huecos engañosos.
    const monthlyMap = new Map<string, number>(
      (monthlyRes.data ?? []).map((row) => [row.month_start.slice(0, 7), row.visits_count])
    );
    setMonthly(
      monthSpine(fromDate, toDate).map((key) => ({ month: key, visits: monthlyMap.get(key) ?? 0 }))
    );

    setTopCompanies(
      (companiesRes.data ?? []).map((row) => ({ name: row.visitor_company, visits: row.visits_count }))
    );
    setTopHosts((hostsRes.data ?? []).map((row) => ({ name: row.full_name, visits: row.visits_count })));

    const statusMap = new Map<string, number>(
      (statusRes.data ?? []).map((row) => [row.status, row.status_count])
    );
    setStatusBreakdown(
      Object.keys(STATUS_LABELS).map((status) => ({
        status,
        label: STATUS_LABELS[status],
        visits: statusMap.get(status) ?? 0,
      }))
    );

    const hourMap = new Map<number, number>(
      (hourRes.data ?? []).map((row) => [row.hour_of_day, row.visits_count])
    );
    setByHour(
      Array.from({ length: 24 }, (_, hour) => ({
        hour: `${hour}:00`,
        visits: hourMap.get(hour) ?? 0,
      }))
    );

    const weekdayMap = new Map<number, number>(
      (weekdayRes.data ?? []).map((row) => [row.weekday, row.visits_count])
    );
    setByWeekday(
      WEEKDAY_LABELS.map((day, index) => ({ day, visits: weekdayMap.get(index) ?? 0 }))
    );

    const currentMonthKey = todayLocal().slice(0, 7);
    const prevMonthKey = monthsAgoStart(1).slice(0, 7);
    const comparisonMap = new Map<string, number>(
      (comparisonRes.data ?? []).map((row) => [row.month_start.slice(0, 7), row.visits_count])
    );
    setComparison({
      current: comparisonMap.get(currentMonthKey) ?? 0,
      previous: comparisonMap.get(prevMonthKey) ?? 0,
    });

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const variation =
    comparison && comparison.previous > 0
      ? ((comparison.current - comparison.previous) / comparison.previous) * 100
      : null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex rounded-md border border-line bg-card p-1">
          <button
            type="button"
            onClick={() => {
              setFromDate(monthsAgoStart(5));
              setToDate(todayLocal());
            }}
            className="rounded px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink"
          >
            Últimos 6 meses
          </button>
          <button
            type="button"
            onClick={() => {
              setFromDate(monthsAgoStart(11));
              setToDate(todayLocal());
            }}
            className="rounded px-3 py-1.5 text-sm font-medium text-ink-soft hover:text-ink"
          >
            Últimos 12 meses
          </button>
        </div>
        <div>
          <label htmlFor="analyticsFrom" className="mb-1 block text-xs font-medium text-ink-soft">
            Desde
          </label>
          <input
            id="analyticsFrom"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="analyticsTo" className="mb-1 block text-xs font-medium text-ink-soft">
            Hasta
          </label>
          <input
            id="analyticsTo"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowColorSettings((v) => !v)}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink"
        >
          {showColorSettings ? "Ocultar colores" : "Personalizar colores"}
        </button>
      </div>

      {showColorSettings && (
        <div className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-line bg-card p-4 shadow-sm">
          {COLOR_FIELDS.map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`chartColor-${field.key}`}
                className="mb-1 block text-xs font-medium text-ink-soft"
              >
                {field.label}
              </label>
              <input
                id={`chartColor-${field.key}`}
                type="color"
                value={chartColors[field.key]}
                onChange={(e) => updateChartColor(field.key, e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border border-line bg-card p-1"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={resetChartColors}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm font-medium text-ink-soft hover:text-ink"
          >
            Restaurar colores por defecto
          </button>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      {loading && <p className="mb-4 text-sm text-ink-soft">Cargando analíticas...</p>}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Entradas por mes">
            {monthly.every((point) => point.visits === 0) ? (
              <EmptyState message="Sin datos para este periodo." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="visits" stroke={chartColors.accent} strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Mes actual frente al mes anterior">
            {comparison ? (
              <div className="flex h-[220px] flex-col items-center justify-center gap-3">
                <p className="font-display text-4xl font-bold text-ink">{comparison.current}</p>
                <p className="text-sm text-ink-soft">
                  entradas este mes · {comparison.previous} el mes pasado
                </p>
                {variation !== null ? (
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      variation >= 0 ? "bg-accent-tint text-accent-dark" : "bg-danger/10 text-danger"
                    }`}
                  >
                    {variation >= 0 ? "+" : ""}
                    {variation.toFixed(1)}%
                  </span>
                ) : (
                  <span className="rounded-full bg-line px-3 py-1 text-sm font-medium text-ink-soft">
                    Sin datos del mes anterior para comparar
                  </span>
                )}
              </div>
            ) : (
              <EmptyState message="Sin datos para este periodo." />
            )}
          </ChartCard>

          <ChartCard title="Top empresas visitantes">
            {topCompanies.length === 0 ? (
              <EmptyState message="Sin datos para este periodo." />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, topCompanies.length * 36)}>
                <BarChart data={topCompanies} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="visits" fill={chartColors.accent} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Colaboradores más visitados">
            {topHosts.length === 0 ? (
              <EmptyState message="Sin datos para este periodo." />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, topHosts.length * 36)}>
                <BarChart data={topHosts} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="visits" fill={chartColors.accentDark} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Estado de pre-registros">
            {statusBreakdown.every((row) => row.visits === 0) ? (
              <EmptyState message="Sin datos para este periodo." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="visits" radius={[4, 4, 0, 0]}>
                    {statusBreakdown.map((row) => (
                      <Cell key={row.status} fill={statusColorMap[row.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Visitas por día de la semana">
            {byWeekday.every((row) => row.visits === 0) ? (
              <EmptyState message="Sin datos para este periodo." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byWeekday}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="visits" fill={chartColors.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Visitas por hora del día">
            {byHour.every((row) => row.visits === 0) ? (
              <EmptyState message="Sin datos para este periodo." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="hour" interval={2} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="visits" fill={chartColors.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}
