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
import { useAuth } from "@/hooks/useAuth";

// rgb(var(--token)) en vez de un hex fijo: como son variables CSS vivas, el
// grid/los ejes/el tooltip siguen el tema activo (claro/oscuro) solos, sin
// necesitar releer nada en React cuando el usuario cambia de tema.
const GRID_STROKE = "rgb(var(--line))";
const TICK_COLOR = "rgb(var(--ink-soft))";
const TOOLTIP_STYLE = {
  backgroundColor: "rgb(var(--card))",
  border: "1px solid rgb(var(--line))",
  borderRadius: 8,
  fontSize: 12,
};
const TOOLTIP_LABEL_STYLE = { color: "rgb(var(--ink))" };

type ChartColors = {
  entradasPorMes: string;
  porHora: string;
  porDiaSemana: string;
  topEmpresas: string;
  topAnfitriones: string;
  preregPendiente: string;
  preregUsada: string;
  preregVencida: string;
};

// Un color por gráfica (y, dentro de "Estado de pre-registros", uno por
// estado) — cambiar el de una no toca las demás. Mismos valores que ya
// tenía la app (tokens de tailwind.config.ts) como punto de partida. Se
// guardan en la tabla analytics_chart_colors, una fila por cuenta (RLS
// restringe cada fila a su propio dueño) — nunca en localStorage, para que
// la personalización viaje con la cuenta y no con el navegador/dispositivo.
const DEFAULT_CHART_COLORS: ChartColors = {
  entradasPorMes: "#1873dc",
  porHora: "#1873dc",
  porDiaSemana: "#1873dc",
  topEmpresas: "#1873dc",
  topAnfitriones: "#0e4381",
  preregPendiente: "#ff9800",
  preregUsada: "#1873dc",
  preregVencida: "#f44336",
};

// Llave vieja de localStorage (versión anterior, por navegador) — ya no se
// lee, solo se limpia una vez si quedó de antes.
const LEGACY_LOCALSTORAGE_KEY = "passhub_analytics_chart_colors_v2";

const PREREG_COLOR_FIELDS: { key: keyof ChartColors; label: string }[] = [
  { key: "preregPendiente", label: "Pendiente" },
  { key: "preregUsada", label: "Usada" },
  { key: "preregVencida", label: "Vencida" },
];

// "cancelada" no se muestra: no existe ninguna acción en la app que
// marque un pre-registro como cancelado, así que siempre saldría en cero
// (ver migración 0045).
const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  usada: "Usada (check-in)",
  vencida: "Vencida",
};

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const LIMIT_OPTIONS = [5, 10, 15, 20];

function formatMonthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

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
  return <div className="flex h-56 items-center justify-center text-sm text-ink-soft">{message}</div>;
}

function LoadingState() {
  return <div className="flex h-56 items-center justify-center text-sm text-ink-soft">Cargando...</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="flex h-56 items-center justify-center text-sm text-danger">{message}</div>;
}

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="color"
      title={label}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-7 shrink-0 cursor-pointer rounded border border-line bg-card p-0.5"
    />
  );
}

function DateRangeFilter({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
}: {
  fromDate: string;
  toDate: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        aria-label="Desde"
        value={fromDate}
        onChange={(e) => onFromChange(e.target.value)}
        className="rounded border border-line bg-card px-1.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
      />
      <span className="text-xs text-ink-soft">–</span>
      <input
        type="date"
        aria-label="Hasta"
        value={toDate}
        onChange={(e) => onToChange(e.target.value)}
        className="rounded border border-line bg-card px-1.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function LimitSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <select
      aria-label="Cuántos mostrar"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded border border-line bg-card px-1.5 py-1 text-xs text-ink focus:border-accent focus:outline-none"
    >
      {LIMIT_OPTIONS.map((n) => (
        <option key={n} value={n}>
          Top {n}
        </option>
      ))}
    </select>
  );
}

function ChartCard({
  title,
  note,
  controls,
  children,
}: {
  title: string;
  note?: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">{title}</h3>
          {note && <p className="mt-0.5 max-w-xs text-xs text-ink-soft">{note}</p>}
        </div>
        {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function MonthlyEntriesChart({ color, onColorChange }: { color: string; onColorChange: (v: string) => void }) {
  const [fromDate, setFromDate] = useState(monthsAgoStart(5));
  const [toDate, setToDate] = useState(todayLocal());
  const [data, setData] = useState<MonthlyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { startIso, endIso } = localRangeToUtc(fromDate, toDate);
    supabase
      .rpc("analytics_visits_by_month", { p_start: startIso, p_end: endIso })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error(err);
          setError("No se pudo cargar.");
          setLoading(false);
          return;
        }
        const map = new Map((rows ?? []).map((row) => [row.month_start.slice(0, 7), row.visits_count]));
        setData(monthSpine(fromDate, toDate).map((key) => ({ month: formatMonthLabel(key), visits: map.get(key) ?? 0 })));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate]);

  return (
    <ChartCard
      title="Entradas por mes"
      controls={
        <>
          <ColorSwatch label="Color de esta gráfica" value={color} onChange={onColorChange} />
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromChange={setFromDate} onToChange={setToDate} />
        </>
      }
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : data.every((point) => point.visits === 0) ? (
        <EmptyState message="Sin datos para este periodo." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_LABEL_STYLE} />
            <Line type="monotone" dataKey="visits" stroke={color} strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function ComparisonCard() {
  const [comparison, setComparison] = useState<{ current: number; previous: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const range = localRangeToUtc(monthsAgoStart(1), todayLocal());
    supabase
      .rpc("analytics_visits_by_month", { p_start: range.startIso, p_end: range.endIso })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error(err);
          setError("No se pudo cargar.");
          setLoading(false);
          return;
        }
        const currentMonthKey = todayLocal().slice(0, 7);
        const prevMonthKey = monthsAgoStart(1).slice(0, 7);
        const map = new Map((rows ?? []).map((row) => [row.month_start.slice(0, 7), row.visits_count]));
        setComparison({ current: map.get(currentMonthKey) ?? 0, previous: map.get(prevMonthKey) ?? 0 });
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const variation =
    comparison && comparison.previous > 0
      ? ((comparison.current - comparison.previous) / comparison.previous) * 100
      : null;

  return (
    <ChartCard title="Mes actual frente al mes anterior">
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : comparison ? (
        <div className="flex h-[220px] flex-col items-center justify-center gap-3">
          <p className="font-display text-4xl font-bold text-ink">{comparison.current}</p>
          <p className="text-sm text-ink-soft">entradas este mes · {comparison.previous} el mes pasado</p>
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
  );
}

function TopCompaniesChart({ color, onColorChange }: { color: string; onColorChange: (v: string) => void }) {
  const [fromDate, setFromDate] = useState(monthsAgoStart(5));
  const [toDate, setToDate] = useState(todayLocal());
  const [limit, setLimit] = useState(10);
  const [data, setData] = useState<NamedCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { startIso, endIso } = localRangeToUtc(fromDate, toDate);
    supabase
      .rpc("analytics_top_visitor_companies", { p_start: startIso, p_end: endIso, p_limit: limit })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error(err);
          setError("No se pudo cargar.");
          setLoading(false);
          return;
        }
        setData((rows ?? []).map((row) => ({ name: row.visitor_company, visits: row.visits_count })));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, limit]);

  return (
    <ChartCard
      title="Top empresas visitantes"
      controls={
        <>
          <ColorSwatch label="Color de esta gráfica" value={color} onChange={onColorChange} />
          <LimitSelect value={limit} onChange={setLimit} />
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromChange={setFromDate} onToChange={setToDate} />
        </>
      }
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : data.length === 0 ? (
        <EmptyState message="Sin datos para este periodo." />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_LABEL_STYLE} />
            <Bar dataKey="visits" fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function TopHostsChart({ color, onColorChange }: { color: string; onColorChange: (v: string) => void }) {
  const [fromDate, setFromDate] = useState(monthsAgoStart(5));
  const [toDate, setToDate] = useState(todayLocal());
  const [limit, setLimit] = useState(10);
  const [data, setData] = useState<NamedCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { startIso, endIso } = localRangeToUtc(fromDate, toDate);
    supabase
      .rpc("analytics_top_hosts", { p_start: startIso, p_end: endIso, p_limit: limit })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error(err);
          setError("No se pudo cargar.");
          setLoading(false);
          return;
        }
        setData((rows ?? []).map((row) => ({ name: row.full_name, visits: row.visits_count })));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, limit]);

  return (
    <ChartCard
      title="Colaboradores más visitados"
      controls={
        <>
          <ColorSwatch label="Color de esta gráfica" value={color} onChange={onColorChange} />
          <LimitSelect value={limit} onChange={setLimit} />
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromChange={setFromDate} onToChange={setToDate} />
        </>
      }
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : data.length === 0 ? (
        <EmptyState message="Sin datos para este periodo." />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_LABEL_STYLE} />
            <Bar dataKey="visits" fill={color} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function PreregStatusChart({
  colors,
  onColorChange,
}: {
  colors: ChartColors;
  onColorChange: (key: keyof ChartColors, value: string) => void;
}) {
  const [fromDate, setFromDate] = useState(monthsAgoStart(5));
  const [toDate, setToDate] = useState(todayLocal());
  const [data, setData] = useState<StatusCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusColorMap: Record<string, string> = {
    pendiente: colors.preregPendiente,
    usada: colors.preregUsada,
    vencida: colors.preregVencida,
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { startIso, endIso } = localRangeToUtc(fromDate, toDate);
    supabase
      .rpc("analytics_prereg_status_breakdown", { p_start: startIso, p_end: endIso })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error(err);
          setError("No se pudo cargar.");
          setLoading(false);
          return;
        }
        const map = new Map<string, number>((rows ?? []).map((row) => [row.status, row.status_count]));
        setData(
          Object.keys(STATUS_LABELS).map((status) => ({
            status,
            label: STATUS_LABELS[status],
            visits: map.get(status) ?? 0,
          }))
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate]);

  return (
    <ChartCard
      title="Estado de pre-registros"
      note="Filtra por la fecha en que se creó el pre-registro, no por la fecha del check-in."
      controls={
        <>
          <div className="flex items-center gap-1">
            {PREREG_COLOR_FIELDS.map((field) => (
              <ColorSwatch
                key={field.key}
                label={field.label}
                value={colors[field.key]}
                onChange={(v) => onColorChange(field.key, v)}
              />
            ))}
          </div>
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromChange={setFromDate} onToChange={setToDate} />
        </>
      }
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : data.every((row) => row.visits === 0) ? (
        <EmptyState message="Sin datos para este periodo." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_LABEL_STYLE} />
            <Bar dataKey="visits" radius={[4, 4, 0, 0]}>
              {data.map((row) => (
                <Cell key={row.status} fill={statusColorMap[row.status]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function WeekdayChart({ color, onColorChange }: { color: string; onColorChange: (v: string) => void }) {
  const [fromDate, setFromDate] = useState(monthsAgoStart(5));
  const [toDate, setToDate] = useState(todayLocal());
  const [data, setData] = useState<WeekdayPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { startIso, endIso } = localRangeToUtc(fromDate, toDate);
    supabase
      .rpc("analytics_visits_by_weekday", { p_start: startIso, p_end: endIso })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error(err);
          setError("No se pudo cargar.");
          setLoading(false);
          return;
        }
        const map = new Map((rows ?? []).map((row) => [row.weekday, row.visits_count]));
        setData(WEEKDAY_LABELS.map((day, index) => ({ day, visits: map.get(index) ?? 0 })));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate]);

  return (
    <ChartCard
      title="Visitas por día de la semana"
      controls={
        <>
          <ColorSwatch label="Color de esta gráfica" value={color} onChange={onColorChange} />
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromChange={setFromDate} onToChange={setToDate} />
        </>
      }
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : data.every((row) => row.visits === 0) ? (
        <EmptyState message="Sin datos para este periodo." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_LABEL_STYLE} />
            <Bar dataKey="visits" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function HourChart({ color, onColorChange }: { color: string; onColorChange: (v: string) => void }) {
  const [fromDate, setFromDate] = useState(monthsAgoStart(5));
  const [toDate, setToDate] = useState(todayLocal());
  const [data, setData] = useState<HourPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { startIso, endIso } = localRangeToUtc(fromDate, toDate);
    supabase
      .rpc("analytics_visits_by_hour", { p_start: startIso, p_end: endIso })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error(err);
          setError("No se pudo cargar.");
          setLoading(false);
          return;
        }
        const map = new Map((rows ?? []).map((row) => [row.hour_of_day, row.visits_count]));
        setData(Array.from({ length: 24 }, (_, hour) => ({ hour: `${hour}:00`, visits: map.get(hour) ?? 0 })));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate]);

  return (
    <ChartCard
      title="Visitas por hora del día"
      controls={
        <>
          <ColorSwatch label="Color de esta gráfica" value={color} onChange={onColorChange} />
          <DateRangeFilter fromDate={fromDate} toDate={toDate} onFromChange={setFromDate} onToChange={setToDate} />
        </>
      }
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} />
      ) : data.every((row) => row.visits === 0) ? (
        <EmptyState message="Sin datos para este periodo." />
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="hour" interval={2} tick={{ fontSize: 11, fill: TICK_COLOR }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: TICK_COLOR }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_LABEL_STYLE} />
            <Bar dataKey="visits" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function AnalyticsSection() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [chartColors, setChartColors] = useState<ChartColors>(DEFAULT_CHART_COLORS);

  useEffect(() => {
    // Limpieza de la versión vieja (localStorage, por navegador) — ya no se
    // lee de ahí, esto solo evita dejar basura suelta.
    try {
      localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
    } catch {
      // no pasa nada si falla, no es data que se vaya a volver a leer
    }

    if (!userId) return;

    supabase
      .from("analytics_chart_colors")
      .select("colors")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          return;
        }
        if (data?.colors) {
          setChartColors({ ...DEFAULT_CHART_COLORS, ...(data.colors as Partial<ChartColors>) });
        }
      });
  }, [userId]);

  function updateColor(key: keyof ChartColors, value: string) {
    if (!userId) return;
    setChartColors((prev) => {
      const next = { ...prev, [key]: value };
      supabase
        .from("analytics_chart_colors")
        .upsert({ user_id: userId, colors: next, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.error(error);
        });
      return next;
    });
  }

  function resetColors() {
    setChartColors(DEFAULT_CHART_COLORS);
    if (!userId) return;
    supabase
      .from("analytics_chart_colors")
      .delete()
      .eq("user_id", userId)
      .then(({ error }) => {
        if (error) console.error(error);
      });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-ink-soft">
          Cada gráfica tiene su propio color y su propio rango de fechas — cámbialos directamente en la
          gráfica que quieras ajustar.
        </p>
        <button
          type="button"
          onClick={resetColors}
          className="shrink-0 text-xs font-medium text-ink-soft hover:text-ink"
        >
          Restaurar todos los colores por defecto
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MonthlyEntriesChart
          color={chartColors.entradasPorMes}
          onColorChange={(v) => updateColor("entradasPorMes", v)}
        />
        <ComparisonCard />
        <TopCompaniesChart color={chartColors.topEmpresas} onColorChange={(v) => updateColor("topEmpresas", v)} />
        <TopHostsChart color={chartColors.topAnfitriones} onColorChange={(v) => updateColor("topAnfitriones", v)} />
        <PreregStatusChart colors={chartColors} onColorChange={updateColor} />
        <WeekdayChart color={chartColors.porDiaSemana} onColorChange={(v) => updateColor("porDiaSemana", v)} />
        <HourChart color={chartColors.porHora} onColorChange={(v) => updateColor("porHora", v)} />
      </div>
    </div>
  );
}
