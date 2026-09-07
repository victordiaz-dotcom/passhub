export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "passhub_theme";

export function getStoredThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage puede fallar (modo privado); se usa "system" por defecto.
  }
  return "system";
}

export function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return preference;
}

export function applyTheme(preference: ThemePreference) {
  document.documentElement.classList.toggle("dark", resolveTheme(preference) === "dark");
}

export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // ver comentario en getStoredThemePreference
  }
  applyTheme(preference);
}
