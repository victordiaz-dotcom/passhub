export type DatePreset = "today" | "last7" | "last15" | "last30" | "all" | "custom";

export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "last7", label: "Últimos 7 días" },
  { value: "last15", label: "Últimos 15 días" },
  { value: "last30", label: "Últimos 30 días" },
  { value: "all", label: "Todo el historial" },
  { value: "custom", label: "Rango personalizado" },
];

export function localDateToday() {
  return formatLocalDate(new Date());
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shiftLocalDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return formatLocalDate(new Date(year, month - 1, day + days));
}

// Los rangos incluyen el día de hoy. "Últimos 7 días" equivale a hoy y
// los seis días anteriores. Null significa que no se limita por fecha.
export function datePresetRange(preset: DatePreset, customFrom = "", customTo = "") {
  if (preset === "all") return { from: null, to: null };
  if (preset === "custom") return { from: customFrom || null, to: customTo || null };
  const today = localDateToday();
  const days = preset === "last7" ? 7 : preset === "last15" ? 15 : preset === "last30" ? 30 : 1;
  return { from: shiftLocalDate(today, 1 - days), to: today };
}
