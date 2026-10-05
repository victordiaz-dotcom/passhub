// Etiquetas compartidas. Los iconos se dibujan en CountryFlag para que no
// dependan de la fuente de emojis disponible en cada sistema.
export const COUNTRY_LABELS: Record<string, string> = { MX: "México", CO: "Colombia", ES: "España", FR: "Francia", IT: "Italia" };

// Países que se pueden ELEGIR en el front. Colombia se queda fuera por
// ahora (solo México y España), pero sigue en las etiquetas para que
// una cuenta u oficina que ya lo tuviera se siga mostrando bien en vez de
// aparecer sin bandera ni nombre. Para retomarlo: volver a poner "CO" aquí
// y reactivar la oficina de Bogotá (ver migración 0079).
export const COUNTRY_ORDER = ["MX", "ES"];
