// La oficina del usuario que comparte la liga tiene prioridad sobre la IP
// del visitante. El formulario público valida que el ID exista y esté activo.
export function preregistrationLink(origin: string, officeId: string | null | undefined): string {
  const url = new URL("/pre-register", origin);
  if (officeId) url.searchParams.set("oficina", officeId);
  return url.toString();
}
