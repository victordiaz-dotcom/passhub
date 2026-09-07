import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { APP_VERSION } from "@/lib/version";

// font-medium siempre presente (no solo en isActive): si el peso de la
// fuente cambia entre estados, cada link cambia de ancho y empuja a los
// demás — por eso el menú "se movía" al cambiar de pestaña.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium ${isActive ? "text-white" : "text-white/70 hover:text-white"}`;

export function AppHeader() {
  const { profile, isAdmin, signOut } = useAuth();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "Usuario";

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-ink text-white">
      <header className="flex h-14 items-center justify-between px-4">
        <span className="flex items-center gap-2 font-display text-lg font-bold">
          <img src="/logo.png" alt="PassHub" className="h-7 w-auto" />
          PassHub
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-sans text-xs font-medium text-white/50">
            {APP_VERSION}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white">
            {firstName}
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

      <nav className="flex h-12 items-center gap-4 border-t border-white/10 px-4">
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
      </nav>
    </div>
  );
}
