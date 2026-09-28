import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/roles";
import { COUNTRY_FLAGS } from "@/lib/countryFlags";
import { ThemeToggle } from "@/components/ThemeToggle";
import { copyToClipboard } from "@/lib/clipboard";
import { preregistrationLink } from "@/lib/preregistrationLink";

// font-medium siempre presente (no solo en isActive): si el peso de la
// fuente cambia entre estados, cada link cambia de ancho y empuja a los
// demás — por eso el menú "se movía" al cambiar de pestaña. Mismo motivo
// por el que el padding de la píldora es igual en ambos estados.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
  }`;

type OfficeLabel = { name: string; country: string };
const officeLabelCache = new Map<string, OfficeLabel>();

export function AppHeader() {
  const { profile, roles, isAdmin, isSuperadmin, signOut } = useAuth();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? "Usuario";
  const roleLabel = roles.map((role) => ROLE_LABELS[role] ?? role).join(", ");
  // office_id null = sin oficina asignada (normalmente superadmin).
  // Se trae el nombre completo (no solo el país)
  // porque México tiene dos oficinas -- con solo la bandera no se distingue
  // CDMX de Monterrey.
  const [office, setOffice] = useState<OfficeLabel | null>(() =>
    profile?.office_id ? officeLabelCache.get(profile.office_id) ?? null : null
  );
  const [linkCopied, setLinkCopied] = useState(false);
  const canCopyPreregLink = !!profile && (isSuperadmin || !!profile.office_id);

  async function handleCopyPreregLink() {
    if (!canCopyPreregLink || !profile) return;
    const ok = await copyToClipboard(preregistrationLink(window.location.origin, profile.office_id));
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }

  useEffect(() => {
    const officeId = profile?.office_id;
    if (!officeId) {
      setOffice(null);
      return;
    }
    const cached = officeLabelCache.get(officeId);
    setOffice(cached ?? null);
    let cancelled = false;
    supabase
      .from("offices")
      .select("name, country")
      .eq("id", officeId)
      .single()
      .then(({ data }) => {
        if (!cancelled) {
          if (data) officeLabelCache.set(officeId, data);
          else officeLabelCache.delete(officeId);
          setOffice(data ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.office_id]);

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
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle />
          {office && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white">
              <span className="text-xl leading-none">{COUNTRY_FLAGS[office.country] ?? ""}</span>
              {office.name}
            </span>
          )}
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white">
            {firstName}
            {roleLabel && <span className="text-white/50"> · {roleLabel}</span>}
          </span>
          <button
            type="button"
            onClick={handleCopyPreregLink}
            disabled={!canCopyPreregLink}
            className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-50"
          >
            {linkCopied ? "¡Copiado!" : "Copiar liga de pre-registro"}
          </button>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-sm text-white/70 hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <nav className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-white/10 px-3 py-2">
        <NavLink to="/" end className={navLinkClass}>
          Registrar visita
        </NavLink>
        <NavLink to="/history" className={navLinkClass}>
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
          <NavLink to="/catalogs" className={navLinkClass}>
            Catálogos
          </NavLink>
        )}
        {isSuperadmin && (
          <NavLink to="/audit-log" className={navLinkClass}>
            Auditoría
          </NavLink>
        )}
      </nav>
    </div>
  );
}
