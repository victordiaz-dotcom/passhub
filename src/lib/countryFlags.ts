// Compartido entre Users.tsx, AppHeader.tsx y Guardia.tsx -- un solo lugar
// para agregar un país nuevo (ej. cuando se agregue otra oficina) en vez
// de repetir el mapeo en cada pantalla.
export const COUNTRY_FLAGS: Record<string, string> = { MX: "🇲🇽", CO: "🇨🇴", ES: "🇪🇸" };
export const COUNTRY_LABELS: Record<string, string> = { MX: "México", CO: "Colombia", ES: "España" };

// Países que se pueden ELEGIR en el front. Colombia se queda fuera por
// ahora (solo México y España), pero sigue en los mapas de arriba para que
// una cuenta u oficina que ya lo tuviera se siga mostrando bien en vez de
// aparecer sin bandera ni nombre. Para retomarlo: volver a poner "CO" aquí
// y reactivar la oficina de Bogotá (ver migración 0079).
export const COUNTRY_ORDER = ["MX", "ES"];
