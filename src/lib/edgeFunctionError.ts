import { FunctionsHttpError } from "@supabase/supabase-js";

// El SDK de Supabase no expone el cuerpo de la respuesta en `data` cuando la
// Edge Function devuelve un status no-2xx — el mensaje real solo vive dentro
// de error.context (la Response cruda). Sin esto, cualquier mensaje
// específico que la función devuelva (ej. "Esa contraseña apareció en una
// filtración...") se pierde y siempre se ve el mensaje genérico de reserva.
export async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (body?.error) return body.error;
  }
  return fallback;
}
