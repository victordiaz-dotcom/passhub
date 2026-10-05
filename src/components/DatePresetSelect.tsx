import { DATE_PRESET_OPTIONS, type DatePreset } from "@/lib/datePresets";

export function DatePresetSelect({
  id,
  value,
  onChange,
  className = "input-field h-auto w-full py-2",
}: {
  id?: string;
  value: DatePreset;
  onChange: (value: DatePreset) => void;
  className?: string;
}) {
  return (
    <select
      id={id}
      aria-label={id ? undefined : "Periodo"}
      value={value}
      onChange={(event) => onChange(event.target.value as DatePreset)}
      className={className}
    >
      {DATE_PRESET_OPTIONS.map(({ value: optionValue, label }) => (
        <option key={optionValue} value={optionValue}>{label}</option>
      ))}
    </select>
  );
}
