import { useEffect } from "react";
import { applyTheme, getStoredThemePreference } from "@/lib/theme";

// Componente sin UI, montado una sola vez junto a IdleLogout en App.tsx.
// Aplica la preferencia de tema guardada y, si es "system", escucha cambios
// en vivo de la preferencia del sistema operativo/navegador mientras la app
// sigue abierta (el script inline en index.html ya evita el flash inicial,
// esto solo mantiene el tema sincronizado después de esa primera carga).
export function ThemeInitializer() {
  useEffect(() => {
    applyTheme(getStoredThemePreference());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (getStoredThemePreference() === "system") {
        applyTheme("system");
      }
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return null;
}
