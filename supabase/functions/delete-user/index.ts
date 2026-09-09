import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Tarea 2 de la sesión: se elimina el borrado de cuentas por completo (solo
// suspender/reactivar, ver set-account-active). No hay forma de borrar una
// Edge Function desplegada desde este entorno, así que queda como stub
// inerte, sin lógica ni acceso a datos.
Deno.serve(() => new Response("disabled", { status: 410 }));
