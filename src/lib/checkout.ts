import { supabase } from "@/integrations/supabase/client";

// Única función que registra la salida de una visita — la usan CheckIn.tsx,
// Dashboard.tsx e Historial.tsx, para no repetir el mismo .update() en tres
// lugares. checked_out_by siempre es quien hace la llamada (el trigger
// lock_visit_immutable_fields ya lo exige así).
export async function checkoutVisit(visitId: string, actorUserId: string) {
  return supabase
    .from("visits")
    .update({
      check_out_at: new Date().toISOString(),
      status: "fuera",
      checked_out_by: actorUserId,
    })
    .eq("id", visitId);
}
