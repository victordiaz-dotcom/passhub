// Compartido entre Users.tsx, AppHeader.tsx y Guardia.tsx -- un solo lugar
// para agregar un país nuevo (ej. cuando se agregue otra oficina) en vez
// de repetir el mapeo en cada pantalla.
export const COUNTRY_FLAGS: Record<string, string> = { MX: "🇲🇽", CO: "🇨🇴", ES: "🇪🇸" };
export const COUNTRY_LABELS: Record<string, string> = { MX: "México", CO: "Colombia", ES: "España" };
export const COUNTRY_ORDER = ["MX", "CO", "ES"];
