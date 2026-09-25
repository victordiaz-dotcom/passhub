// Placeholders para el instante en que una pantalla todavía no tiene datos
// (sesión cargando, tabla esperando su primer fetch) -- reemplazan el
// parpadeo de "tabla vacía" o pantalla en blanco por bloques grises
// animados, mismo criterio visual en toda la app.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line ${className}`} />;
}

export function TableSkeletonRows({ rows = 5, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className="h-4 w-full max-w-[140px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Pantalla completa, para el hueco antes de saber si hay sesión/rol
// (ProtectedRoute, HomeRoute) -- ahí todavía no existe ni el header.
export function PageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <div className="h-16 w-full border-b border-line bg-card" />
      <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
