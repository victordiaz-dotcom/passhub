import { supabase } from "@/integrations/supabase/client";

// Debe coincidir exactamente con la columna generada normalized_name de
// flagged_visitors (minúsculas + espacios colapsados) -- se usa del lado
// del cliente para armar el filtro de búsqueda, la comparación real la
// hace Postgres con la misma regla.
export function normalizeVisitorName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export type FlaggedVisitorMatch = {
  full_name: string;
  note: string | null;
  created_at: string;
};

// Devuelve la marca más reciente que coincida con ese nombre normalizado,
// o null si no hay ninguna. Solo informativo -- nunca bloquea nada, quien
// llama decide qué mostrar.
export async function findFlaggedVisitor(name: string): Promise<FlaggedVisitorMatch | null> {
  const normalized = normalizeVisitorName(name);
  if (!normalized) return null;

  const { data } = await supabase
    .from("flagged_visitors")
    .select("full_name, note, created_at")
    .eq("normalized_name", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

// Se llama justo después de un checkoutVisit() exitoso, solo cuando
// recepción marcó la casilla de comportamiento violento/hostil en el
// diálogo de confirmar salida.
export async function flagVisitor(params: {
  fullName: string;
  note: string;
  visitId: string;
  flaggedBy: string;
}) {
  return supabase.from("flagged_visitors").insert({
    // Se guarda ya recortado: la columna generada normalized_name usa
    // trim() de Postgres, que solo quita ESPACIOS -- un nombre pegado con
    // un tabulador o un salto de línea quedaba normalizado con un espacio
    // suelto en la orilla y ya nunca volvía a coincidir con la búsqueda
    // del front (que usa .trim() de JS, el cual sí quita todo espacio en
    // blanco). Resultado: la persona quedaba marcada pero la advertencia
    // no volvía a salir nunca.
    full_name: params.fullName.trim(),
    note: params.note.trim() || null,
    visit_id: params.visitId,
    flagged_by: params.flaggedBy,
  });
}
