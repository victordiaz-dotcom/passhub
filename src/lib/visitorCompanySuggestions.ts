// Sugerencias base para "Empresa del visitante": las más comunes en una
// recepción (paqueterías, mensajería, proveedores frecuentes). No es
// catálogo de negocio ni se restringe la captura a esta lista — el campo
// sigue siendo texto libre, esto solo alimenta el autocompletado inicial
// antes de que haya suficiente historial real.
export const COMMON_VISITOR_COMPANIES = [
  "DHL",
  "FedEx",
  "UPS",
  "Estafeta",
  "Paquetexpress",
  "Amazon",
  "Mercado Libre",
  "Coca-Cola",
  "CFE",
  "Telmex",
  "Rappi",
  "Uber",
];

// Combina lo más frecuente en el historial real (ya viene ordenado por
// frecuencia descendente) con la lista de sugerencias comunes, sin
// duplicados — comparando sin distinguir mayúsculas/minúsculas. Lo más
// usado va primero: así el campo "aprende" de lo que más se repite.
export function mergeVisitorCompanySuggestions(frequent: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const name of [...frequent, ...COMMON_VISITOR_COMPANIES]) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }

  return merged;
}
