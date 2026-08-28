import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm ${isActive ? "font-medium text-white" : "text-white/70 hover:text-white"}`;

export function AppHeader() {
  const { isAdmin, signOut } = useAuth();

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-ink text-white">
      <header className="flex h-14 items-center justify-between px-4">
        <span className="font-display text-lg font-bold">PassHub</span>
        <button
          type="button"
          onClick={() => signOut()}
          className="text-sm text-white/70 hover:text-white"
        >
          Cerrar sesión
        </button>
      </header>

      <nav className="flex h-12 items-center gap-4 border-t border-white/10 px-4">
        <NavLink to="/" end className={navLinkClass}>
          Registrar visita
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={navLinkClass}>
            Panel admin
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
