import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { getStoredThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Tema claro", Icon: Sun },
  { value: "dark", label: "Tema oscuro", Icon: Moon },
  { value: "system", label: "Usar el tema del sistema", Icon: Monitor },
];

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(getStoredThemePreference);

  return (
    <div className="flex items-center gap-1 rounded-full bg-white/10 p-1">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={preference === value}
          onClick={() => {
            setThemePreference(value);
            setPreference(value);
          }}
          className={`rounded-full p-1.5 ${
            preference === value ? "bg-white/20 text-white" : "text-white/60 hover:text-white"
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
