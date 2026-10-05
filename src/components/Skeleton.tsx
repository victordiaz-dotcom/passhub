// Placeholders para el instante en que una pantalla todavía no tiene datos
// (sesión cargando, tabla esperando su primer fetch) -- reemplazan el
// parpadeo de "tabla vacía" o pantalla en blanco por bloques grises
// animados, mismo criterio visual en toda la app.
import { useLocation } from "react-router-dom";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-line ${className}`} />;
}

export function TableSkeletonRows({ rows = 5, columns, variant = "default" }: { rows?: number; columns: number; variant?: "default" | "catalog" }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-line last:border-0" aria-hidden="true">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-4 py-4">
              <Skeleton className={`${variant === "catalog" && c === columns - 1 ? "h-5 w-16 rounded-full" : c === 0 ? "h-4 w-32 max-w-full" : c % 2 === 0 ? "h-4 w-20 max-w-full" : "h-4 w-28 max-w-full"}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Misma estructura de carga para el área de resultados de Historial y Panel.
export function PanelContentSkeleton() {
  return (
    <div className="card min-h-80 overflow-hidden p-0" role="status" aria-label="Cargando resultados">
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-4 sm:px-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-20" /></div>
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-4 w-32 max-w-full" /></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TablePanelSkeleton({ headers, width = "auto" }: { headers: string[]; width?: "auto" | "preregs" | "visits" }) {
  const tableWidth = width === "visits" ? "min-w-[1200px]" : width === "preregs" ? "min-w-[1000px]" : "";
  return (
    <div className="card min-h-80 overflow-x-auto p-0" role="status" aria-label="Cargando resultados">
      <table className={`w-full text-left text-sm ${tableWidth}`}>
        <thead className="tbl-head border-b border-line text-ink-soft">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody><TableSkeletonRows rows={5} columns={headers.length} /></tbody>
      </table>
    </div>
  );
}

// Pantalla completa, para el hueco antes de saber si hay sesión/rol
// (ProtectedRoute, HomeRoute) -- conserva la altura del header y el menú.
export function PageSkeleton() {
  const { pathname } = useLocation();
  const width = pathname === "/employees" || pathname === "/catalogs" ? "narrow" : pathname === "/users" || pathname === "/audit-log" || pathname === "/" ? "medium" : "wide";
  const contentWidth = { full: "max-w-none", narrow: "max-w-4xl", medium: "max-w-6xl", wide: "max-w-7xl" }[width];
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <div className="bg-ink px-4 py-2 text-white">
        <div className="flex min-h-9 items-center justify-between gap-4">
          <span className="flex items-center gap-2 font-display text-lg font-bold"><img src="/logo.png" alt="" className="h-7 w-auto" />PassHub</span>
          <div className="flex items-center gap-3" aria-hidden="true"><div className="h-7 w-24 rounded-full bg-white/10" /><div className="h-7 w-28 rounded-full bg-white/10" /></div>
        </div>
      </div>
      <div className="flex min-h-12 items-center gap-3 border-t border-white/10 bg-ink px-4" aria-hidden="true">
        <div className="h-7 w-24 rounded-full bg-white/10" /><div className="h-7 w-20 rounded-full bg-white/10" /><div className="h-7 w-28 rounded-full bg-white/10" />
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6" role="status" aria-label="Cargando PassHub">
        <div className={contentWidth}>
          <div className="mb-6 space-y-3 border-b border-line pb-5"><Skeleton className="h-7 w-56" /><Skeleton className="h-4 w-64" /></div>
          <div className="grid gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]">
            <Skeleton className="h-48 w-full" />
            <div className="card min-h-80 p-5"><Skeleton className="h-5 w-40" /><Skeleton className="mt-6 h-4 w-full" /><Skeleton className="mt-5 h-4 w-5/6" /><Skeleton className="mt-5 h-4 w-3/4" /></div>
          </div>
        </div>
      </main>
    </div>
  );
}
