import { supabase } from "@/integrations/supabase/client";

// Única función que registra la salida de una visita — la usan CheckIn.tsx,
// Dashboard.tsx e Historial.tsx, para no repetir el mismo .update() en tres
// lugares. checked_out_by siempre es quien hace la llamada (el trigger
// lock_visit_immutable_fields ya lo exige así).
export async function checkoutVisit(visitId: string, actorUserId: string) {
  // .select("id") + .maybeSingle() son necesarios para poder detectar un
  // update que no tocó ninguna fila: sin .select(), PostgREST responde 204
  // (sin cuerpo) tanto si el UPDATE afectó la fila como si RLS la filtró (0
  // filas) o el id ya no existe -- en los tres casos supabase-js regresaba
  // { error: null }, así que "Registrar salida" parecía funcionar (el
  // diálogo se cerraba sin error) pero el estado nunca cambiaba. Con
  // .select(), 0 filas afectadas se puede distinguir (data === null) y
  // reportarse como el error real que es.
  const { data, error } = await supabase
    .from("visits")
    .update({
      check_out_at: new Date().toISOString(),
      status: "fuera",
      checked_out_by: actorUserId,
    })
    .eq("id", visitId)
    .select("id")
    .maybeSingle();

  if (!error && !data) {
    return {
      data,
      error: { message: "No se encontró la visita o ya no tienes permiso para modificarla." },
    };
  }

  return { data, error };
}
