import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS } from "@/lib/roles";
import type { Tables } from "@/integrations/supabase/types";

type AuditRow = Tables<"audit_logs">;
type ProfileLite = { id: string; full_name: string; email: string };

const filterInputClass = "input-field h-auto py-2 disabled:opacity-50";

const ACTION_LABELS: Record<string, string> = {
  create_user: "Cuenta creada",
  reset_password: "Contraseña restablecida",
  update_email: "Correo editado",
  activate_user: "Cuenta activada",
  deactivate_user: "Cuenta desactivada",
  grant_role: "Rol otorgado",
  revoke_role: "Rol revocado",
  create: "Visita registrada",
  update: "Visita actualizada",
};

// companies/divisions/visit_types comparten las acciones genéricas
// "create"/"update" con visits (mismo log_audit) — se distinguen por
// entity para no reusar la etiqueta de "Visita registrada/actualizada".
const CATALOG_ENTITY_LABELS: Record<string, string> = {
  companies: "Empresa",
  divisions: "División",
  visit_types: "Tipo de visita",
};

function isCatalogEntity(entity: string) {
  return entity in CATALOG_ENTITY_LABELS;
}

function catalogActionLabel(row: AuditRow): string {
  const noun = CATALOG_ENTITY_LABELS[row.entity];
  if (row.action === "create") return `${noun} creada`;
  if (row.action === "update") return `${noun} actualizada`;
  return row.action;
}

// created_at es un timestamp en UTC; para filtrar por día de calendario
// LOCAL se calculan los límites del día local y se convierten a UTC. Mismo
// criterio que Historial.tsx/AnalyticsSection.tsx.
function localDayRangeUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

const PASSWORD_MODE_LABELS: Record<string, string> = {
  auto: "contraseña generada automáticamente",
  manual: "contraseña definida por el administrador",
};

function summarizeDetail(row: AuditRow): string {
  const detail = row.detail as Record<string, unknown> | null;
  if (!detail) return "—";

  switch (row.action) {
    case "update_email":
      return `${detail.old_email ?? "?"} → ${detail.new_email ?? "?"}`;
    case "create_user": {
      const role = detail.role as string | undefined;
      const username = detail.username as string | undefined;
      const passwordMode = detail.passwordMode as string | undefined;
      const parts = [
        username ? `Usuario: ${username}` : null,
        role ? `Rol: ${ROLE_LABELS[role] ?? role}` : null,
        passwordMode ? PASSWORD_MODE_LABELS[passwordMode] ?? null : null,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : "—";
    }
    case "reset_password": {
      const passwordMode = detail.passwordMode as string | undefined;
      return passwordMode ? PASSWORD_MODE_LABELS[passwordMode] ?? "—" : "—";
    }
    case "grant_role":
    case "revoke_role": {
      const role = detail.role as string | undefined;
      return role ? `Rol: ${ROLE_LABELS[role] ?? role}` : "—";
    }
    case "create": {
      if (isCatalogEntity(row.entity)) {
        const name = (detail as { name?: string }).name;
        return name ? `Nombre: ${name}` : "—";
      }
      const d = detail as {
        visitor_name?: string;
        visit_type?: string;
        division?: string | null;
        reason?: string | null;
      };
      const parts = [
        d.visitor_name ? `Visitante: ${d.visitor_name}` : null,
        d.visit_type ? `Tipo: ${d.visit_type}` : null,
        d.division ? `División: ${d.division}` : null,
        d.reason ? `Motivo: ${d.reason}` : null,
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : "—";
    }
    case "update": {
      if (isCatalogEntity(row.entity)) {
        const oldActive = (detail as { old?: { active?: boolean } }).old?.active;
        const newActive = (detail as { new?: { active?: boolean } }).new?.active;
        if (oldActive !== newActive) return newActive ? "Reactivada" : "Desactivada";
        return "—";
      }
      const oldRow = (detail as { old?: { status?: string; visitor_name?: string } }).old;
      const newRow = (detail as { new?: { status?: string; visitor_name?: string } }).new;
      if (!oldRow?.status || !newRow?.status || oldRow.status === newRow.status) return "—";
      const who = newRow.visitor_name ? `${newRow.visitor_name}: ` : "";
      return `${who}${oldRow.status} → ${newRow.status}`;
    }
    default:
      return "—";
  }
}

export default function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});
  const [admins, setAdmins] = useState<ProfileLite[]>([]);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState<"cuentas" | "visitas" | "catalogos" | "todas">("cuentas");
  const [actorId, setActorId] = useState("");

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .then(({ data }) => {
        const map: Record<string, ProfileLite> = {};
        for (const p of data ?? []) map[p.id] = p;
        setProfilesById(map);
      });

    supabase
      .from("user_roles")
      .select("role, profiles(id, full_name, email)")
      .in("role", ["admin", "superadmin"])
      .then(({ data }) => {
        const list = (data ?? [])
          .map((r) => r.profiles as ProfileLite | null)
          .filter((p): p is ProfileLite => !!p);
        setAdmins(list);
      });
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);

      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (dateFrom) query = query.gte("created_at", localDayRangeUtc(dateFrom).startIso);
      if (dateTo) query = query.lt("created_at", localDayRangeUtc(dateTo).endIso);
      if (category === "cuentas") query = query.in("entity", ["profiles", "user_roles"]);
      if (category === "visitas") query = query.eq("entity", "visits");
      if (category === "catalogos") query = query.in("entity", ["companies", "divisions", "visit_types"]);
      if (actorId) query = query.eq("actor_id", actorId);

      const { data } = await query;
      setRows(data ?? []);
      setLoading(false);
    }
    load();
  }, [dateFrom, dateTo, category, actorId]);

  const targetLabel = useMemo(
    () => (row: AuditRow) => {
      if (isCatalogEntity(row.entity)) {
        const detail = row.detail as { name?: string; new?: { name?: string }; old?: { name?: string } } | null;
        const name = detail?.name ?? detail?.new?.name ?? detail?.old?.name;
        return name ?? "—";
      }
      if (row.entity !== "profiles" && row.entity !== "user_roles") return "—";
      const profile = row.entity_id ? profilesById[row.entity_id] : null;
      if (profile) return `${profile.full_name} (${profile.email})`;
      const detail = row.detail as { full_name?: string; email?: string } | null;
      if (detail?.full_name || detail?.email) {
        return [detail.full_name, detail.email].filter(Boolean).join(" ");
      }
      return "Cuenta eliminada";
    },
    [profilesById]
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 font-display text-xl font-bold text-ink">Auditoría</h1>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Desde</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={filterInputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Hasta</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={filterInputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Categoría</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className={filterInputClass}
          >
            <option value="cuentas">Cuentas</option>
            <option value="visitas">Visitas</option>
            <option value="catalogos">Catálogos</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Actor</label>
          <select value={actorId} onChange={(e) => setActorId(e.target.value)} className={filterInputClass}>
            <option value="">Todos</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
        </div>
        {(dateFrom || dateTo || actorId || category !== "cuentas") && (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setActorId("");
              setCategory("cuentas");
            }}
            className="text-sm font-medium text-ink-soft hover:text-ink"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Acción</th>
              <th className="px-4 py-3 font-medium">Elemento afectado</th>
              <th className="px-4 py-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                  No hay registros para este filtro.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const actor = row.actor_id ? profilesById[row.actor_id] : null;
              return (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{formatDateTime(row.created_at)}</td>
                  <td className="px-4 py-3 text-ink">{actor ? actor.full_name : "Sistema"}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {isCatalogEntity(row.entity) ? catalogActionLabel(row) : ACTION_LABELS[row.action] ?? row.action}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{targetLabel(row)}</td>
                  <td className="px-4 py-3 text-ink-soft">{summarizeDetail(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ink-soft">Se muestran los últimos 200 registros que coinciden con el filtro.</p>
    </div>
  );
}
