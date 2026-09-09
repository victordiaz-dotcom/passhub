import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { APP_VERSION } from "@/lib/version";
import { ROLE_LABELS } from "@/lib/roles";
import { ThemeToggle } from "@/components/ThemeToggle";

// font-medium siempre presente (no solo en isActive): si el peso de la
// fuente cambia entre estados, cada link cambia de ancho y empuja a los
// demás — por eso el menú "se movía" al cambiar de pestaña.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium ${isActive ? "text-white" : "text-white/70 hover:text-white"}`;

export function AppHeader() {
  const { profile, roles, isAdmin, isSuperadmin, signOut } = useAuth();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "Usuario";
  const roleLabel = roles.map((role) => ROLE_LABELS[role] ?? role).join(", ");

  return (
    // sticky en vez de fixed: el header ocupa su alto real dentro del flujo
    // del documento (empuja el contenido, en vez de superponerse encima).
    // Con fixed, Layout.tsx tenía que adivinar un padding-top fijo para el
    // <main> — en pantallas angostas, donde el menú necesita más de una
    // línea, esa altura ya no coincidía y el contenido quedaba tapado o
    // separado de más. Mismo patrón que ya usa Guardia.tsx.
    <div className="sticky top-0 z-50 bg-ink text-white">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <span className="flex items-center gap-2 font-display text-lg font-bold">
          <img src="/logo.png" alt="PassHub" className="h-7 w-auto" />
          PassHub
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-xs font-medium text-white/50">
            {APP_VERSION}
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white">
            {firstName}
            {roleLabel && <span className="text-white/50"> · {roleLabel}</span>}
          </span>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-sm text-white/70 hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 px-4 py-2">
        <NavLink to="/" end className={navLinkClass}>
          Registrar visita
        </NavLink>
        <NavLink to="/historial" className={navLinkClass}>
          Historial
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={navLinkClass}>
            Panel de control
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/employees" className={navLinkClass}>
            Colaboradores
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/users" className={navLinkClass}>
            Cuentas
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/catalogos" className={navLinkClass}>
            Catálogos
          </NavLink>
        )}
        {isSuperadmin && (
          <NavLink to="/auditoria" className={navLinkClass}>
            Auditoría
          </NavLink>
        )}
      </nav>
    </div>
  );
}
