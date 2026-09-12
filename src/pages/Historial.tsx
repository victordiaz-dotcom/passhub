import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { checkoutVisit } from "@/lib/checkout";
import type { Tables } from "@/integrations/supabase/types";

type VisitRow = Pick<
  Tables<"visits">,
  | "id"
  | "folio"
  | "visitor_name"
  | "check_in_at"
  | "check_out_at"
  | "status"
  | "preregistration_id"
  | "visit_type"
  | "created_by_name"
  | "checked_out_by_name"
> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
};

type PreregRow = Pick<
  Tables<"visit_preregistrations">,
  "id" | "visitor_name" | "visit_date" | "status" | "used_at" | "extended_until" | "created_at"
> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
  companies: Pick<Tables<"companies">, "name"> | null;
};

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// created_at es un timestamp en UTC; para filtrar "el día que se generó" con
// el sentido de un día de calendario LOCAL (no UTC), se calculan los límites
// del día local y se convierten a su equivalente UTC para comparar.
function localDayRangeUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function startOfMonthLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

// Semana de calendario que empieza en lunes.
function startOfWeekLocal() {
  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const d = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type Receptionist = { id: string; full_name: string };

const filterInputClass = "input-field h-auto py-2 disabled:opacity-50";

type FrequencyRow = { name: string; count: number; lastVisit: string };

export default function Historial() {
  const { session, isAdmin } = useAuth();
  const [view, setView] = useState<"visitas" | "preregistros" | "frecuencia">("visitas");
  const [mode, setMode] = useState<"fecha" | "todos">("fecha");
  const [date, setDate] = useState(todayLocal());
  const [dateField, setDateField] = useState<"visita" | "creacion">("visita");
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [creatorFilter, setCreatorFilter] = useState("");
  const [visitorNameInput, setVisitorNameInput] = useState("");
  const [visitorNameQuery, setVisitorNameQuery] = useState("");
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<VisitRow | null>(null);
  const [preregs, setPreregs] = useState<PreregRow[]>([]);
  const [preregLoading, setPreregLoading] = useState(true);
  const [extensionDrafts, setExtensionDrafts] = useState<Record<string, string>>({});
  const [extensionSavingId, setExtensionSavingId] = useState<string | null>(null);
  const [frequencyRange, setFrequencyRange] = useState<"todo" | "mes" | "semana">("todo");
  const [frequency, setFrequency] = useState<FrequencyRow[]>([]);
  const [frequencyLoading, setFrequencyLoading] = useState(true);

  useEffect(() => {
    // Solo admin puede filtrar por recepcionista, así que solo admin necesita
    // esta lista.
    if (!isAdmin) return;
    supabase
      .from("profiles")
      .select("id, full_name, user_roles(role)")
      .then(({ data }) => {
        const list = (data ?? [])
          .filter((profile) => profile.user_roles?.some((r) => r.role === "recepcion"))
          .map((profile) => ({ id: profile.id, full_name: profile.full_name }));
        setReceptionists(list);
      });
  }, [isAdmin]);

  useEffect(() => {
    const timeout = setTimeout(() => setVisitorNameQuery(visitorNameInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [visitorNameInput]);

  async function loadVisits() {
    if (!session?.user) return;

    setLoading(true);

    // Recepción ve todas las visitas, igual que admin — no solo las que
    // ella registró o cerró. RLS ya lo permite (visits_select no filtra
    // por dueño para admin/recepción/superadmin), esto solo confirma que
    // el frontend no le agrega una restricción de más.
    let query = supabase
      .from("visits")
      .select(
        "id, folio, visitor_name, check_in_at, check_out_at, status, preregistration_id, visit_type, created_by_name, checked_out_by_name, employees(full_name)"
      )
      .order("check_in_at", { ascending: false });

    if (mode === "fecha") {
      query = query.eq("visit_date", date);
    }

    if (isAdmin && creatorFilter) {
      query = query.eq("created_by", creatorFilter);
    }

    if (visitorNameQuery) {
      query = query.ilike("visitor_name", `%${visitorNameQuery}%`);
    }

    const { data } = await query;
    setVisits((data as VisitRow[] | null) ?? []);
    setLoading(false);
  }

  async function handleCheckout(visitId: string) {
    if (!session?.user) return;
    setCheckoutError(null);

    const { error } = await checkoutVisit(visitId, session.user.id);

    if (error) {
      console.error(error);
      setCheckoutError("No se pudo registrar la salida. Intenta de nuevo.");
      return;
    }

    loadVisits();
  }

  useEffect(() => {
    loadVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, creatorFilter, visitorNameQuery, session?.user?.id, isAdmin]);

  async function loadPreregs() {
    setPreregLoading(true);

    // Esta vista es solo para admin: quiénes generaron un pre-registro,
    // hayan llegado a entrar o no (los que nunca se usan no aparecen en
    // "visits", porque ese registro solo se crea al hacer check-in).
    let query = supabase
      .from("visit_preregistrations")
      .select(
        "id, visitor_name, visit_date, status, used_at, extended_until, created_at, employees(full_name), companies(name)"
      )
      .order("visit_date", { ascending: false });

    if (mode === "fecha") {
      if (dateField === "visita") {
        query = query.eq("visit_date", date);
      } else {
        const { startIso, endIso } = localDayRangeUtc(date);
        query = query.gte("created_at", startIso).lt("created_at", endIso);
      }
    }

    if (visitorNameQuery) {
      query = query.ilike("visitor_name", `%${visitorNameQuery}%`);
    }

    const { data } = await query;
    setPreregs((data as PreregRow[] | null) ?? []);
    setPreregLoading(false);
  }

  useEffect(() => {
    if (!isAdmin || view !== "preregistros") return;
    loadPreregs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, view, mode, date, dateField, visitorNameQuery]);

  async function saveExtension(id: string, newExpiry: string) {
    setExtensionSavingId(id);
    const { error } = await supabase
      .from("visit_preregistrations")
      .update({ extended_until: newExpiry })
      .eq("id", id);
    setExtensionSavingId(null);

    if (error) {
      console.error(error);
      return;
    }

    setExtensionDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    loadPreregs();
  }

  async function loadFrequency() {
    setFrequencyLoading(true);

    // Cuenta visitas por nombre de visitante (normalizado: sin espacios ni
    // mayúsculas/minúsculas) para detectar visitantes recurrentes, desde el
    // inicio o acotado al mes/semana de calendario en curso.
    let query = supabase
      .from("visits")
      .select("visitor_name, check_in_at")
      .order("check_in_at", { ascending: false });

    if (frequencyRange === "mes") {
      query = query.gte("check_in_at", localDayRangeUtc(startOfMonthLocal()).startIso);
    } else if (frequencyRange === "semana") {
      query = query.gte("check_in_at", localDayRangeUtc(startOfWeekLocal()).startIso);
    }

    if (visitorNameQuery) {
      query = query.ilike("visitor_name", `%${visitorNameQuery}%`);
    }

    const { data } = await query;

    const byName = new Map<string, FrequencyRow>();
    for (const row of data ?? []) {
      const key = row.visitor_name.trim().toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        existing.count += 1;
        if (row.check_in_at > existing.lastVisit) existing.lastVisit = row.check_in_at;
      } else {
        byName.set(key, { name: row.visitor_name.trim(), count: 1, lastVisit: row.check_in_at });
      }
    }

    setFrequency(Array.from(byName.values()).sort((a, b) => b.count - a.count));
    setFrequencyLoading(false);
  }

  useEffect(() => {
    if (!isAdmin || view !== "frecuencia") return;
    loadFrequency();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, view, frequencyRange, visitorNameQuery]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="font-display text-xl font-bold text-ink">Historial de visitas</h1>
        <p className="text-sm text-ink-soft">
          {isAdmin ? "Todas las empresas y recepcionistas." : "Todas las visitas, sin importar quién las registró."}
        </p>
      </div>

      {isAdmin && (
        <div className="mb-4 flex w-fit rounded-md border border-line bg-card p-1">
          <button
            type="button"
            onClick={() => setView("visitas")}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              view === "visitas" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            Visitas
          </button>
          <button
            type="button"
            onClick={() => setView("preregistros")}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              view === "preregistros" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            Pre-registros
          </button>
          <button
            type="button"
            onClick={() => setView("frecuencia")}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              view === "frecuencia" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            Frecuencia
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-end gap-3">
        {view === "frecuencia" ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Periodo</label>
            <div className="flex rounded-md border border-line bg-card p-1">
              <button
                type="button"
                onClick={() => setFrequencyRange("todo")}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  frequencyRange === "todo" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                Todo el tiempo
              </button>
              <button
                type="button"
                onClick={() => setFrequencyRange("mes")}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  frequencyRange === "mes" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                Este mes
              </button>
              <button
                type="button"
                onClick={() => setFrequencyRange("semana")}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  frequencyRange === "semana" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                Esta semana
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex rounded-md border border-line bg-card p-1">
              <button
                type="button"
                onClick={() => setMode("fecha")}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  mode === "fecha" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                Por fecha
              </button>
              <button
                type="button"
                onClick={() => setMode("todos")}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  mode === "todos" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
                }`}
              >
                Todas
              </button>
            </div>

            <div>
              <label htmlFor="historialDate" className="mb-1 block text-xs font-medium text-ink-soft">
                Fecha{view === "preregistros" ? (dateField === "visita" ? " de visita" : " de creación") : ""}
              </label>
              <input
                id="historialDate"
                type="date"
                disabled={mode === "todos"}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={filterInputClass}
              />
            </div>
          </>
        )}

        {view === "preregistros" && (
          <div>
            <label htmlFor="historialDateField" className="mb-1 block text-xs font-medium text-ink-soft">
              Filtrar por
            </label>
            <select
              id="historialDateField"
              disabled={mode === "todos"}
              value={dateField}
              onChange={(e) => setDateField(e.target.value as "visita" | "creacion")}
              className={filterInputClass}
            >
              <option value="visita">Fecha de visita</option>
              <option value="creacion">Fecha de creación</option>
            </select>
          </div>
        )}

        {isAdmin && view === "visitas" && (
          <div>
            <label htmlFor="historialCreator" className="mb-1 block text-xs font-medium text-ink-soft">
              Recepción
            </label>
            <select
              id="historialCreator"
              value={creatorFilter}
              onChange={(e) => setCreatorFilter(e.target.value)}
              className={filterInputClass}
            >
              <option value="">Todas</option>
              {receptionists.map((receptionist) => (
                <option key={receptionist.id} value={receptionist.id}>
                  {receptionist.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="historialVisitorName" className="mb-1 block text-xs font-medium text-ink-soft">
            Nombre del visitante
          </label>
          <input
            id="historialVisitorName"
            type="text"
            placeholder="Escribe para buscar..."
            value={visitorNameInput}
            onChange={(e) => setVisitorNameInput(e.target.value)}
            className={filterInputClass}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setMode("fecha");
            setDate(todayLocal());
            setDateField("visita");
            setCreatorFilter("");
            setVisitorNameInput("");
            setFrequencyRange("todo");
          }}
          className="text-sm font-medium text-ink-soft underline hover:text-ink"
        >
          Borrar filtros
        </button>
      </div>

      {view === "frecuencia" ? (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="tbl-head border-b border-line text-ink-soft">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Visitante</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Veces que ha venido</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Última visita</th>
              </tr>
            </thead>
            <tbody>
              {!frequencyLoading && frequency.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-ink-soft">
                    No hay visitas que coincidan con estos filtros.
                  </td>
                </tr>
              )}
              {frequency.map((row) => (
                <tr key={row.name.toLowerCase()} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{row.name}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {row.count} {row.count === 1 ? "vez" : "veces"}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {new Date(row.lastVisit).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === "visitas" ? (
        <div>
          {checkoutError && <p className="mb-3 text-sm text-danger">{checkoutError}</p>}
          <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead>
              <tr className="tbl-head border-b border-line text-ink-soft">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Folio</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Visitante</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">A quién visita</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Tipo</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Registró</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Pre-registro</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Hora de entrada</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Hora de salida</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Marcó salida</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Estado</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!loading && visits.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-ink-soft">
                    No hay visitas que coincidan con estos filtros.
                  </td>
                </tr>
              )}
              {visits.map((visit) => (
                <tr key={visit.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{visit.folio}</td>
                  <td className="px-4 py-3 text-ink">{visit.visitor_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{visit.employees?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{visit.visit_type ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{visit.created_by_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        visit.preregistration_id
                          ? "bg-accent-tint text-accent-dark"
                          : "bg-line text-ink-soft"
                      }`}
                    >
                      {visit.preregistration_id ? "Sí" : "No"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{formatTime(visit.check_in_at)}</td>
                  <td className="px-4 py-3 text-ink-soft">{formatTime(visit.check_out_at)}</td>
                  <td className="px-4 py-3 text-ink-soft">{visit.checked_out_by_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        visit.status === "dentro"
                          ? "bg-accent-tint text-accent-dark"
                          : "bg-line text-ink-soft"
                      }`}
                    >
                      {visit.status === "dentro" ? "Dentro" : "Fuera"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {visit.status === "dentro" ? (
                      <button
                        type="button"
                        onClick={() => setCheckoutTarget(visit)}
                        className="whitespace-nowrap text-sm font-medium text-accent hover:text-accent-dark"
                      >
                        Registrar salida
                      </button>
                    ) : (
                      <span className="text-sm text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="tbl-head border-b border-line text-ink-soft">
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Visitante</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Visita a</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Fecha de visita</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Fecha de creación</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Entró</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Estado</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Vigente hasta</th>
                <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Prórroga</th>
              </tr>
            </thead>
            <tbody>
              {!preregLoading && preregs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-ink-soft">
                    No hay pre-registros que coincidan con estos filtros.
                  </td>
                </tr>
              )}
              {preregs.map((prereg) => {
                const expiresOn = prereg.extended_until ?? addDays(prereg.visit_date, 7);
                const expired = todayLocal() > expiresOn;
                const draft = extensionDrafts[prereg.id] ?? expiresOn;

                return (
                  <tr key={prereg.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{prereg.visitor_name}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {prereg.employees?.full_name ?? "—"}
                      {prereg.companies?.name ? ` · ${prereg.companies.name}` : ""}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{formatDate(prereg.visit_date)}</td>
                    <td className="px-4 py-3 text-ink-soft">
                      {new Date(prereg.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          prereg.status === "usada"
                            ? "bg-accent-tint text-accent-dark"
                            : "bg-line text-ink-soft"
                        }`}
                      >
                        {prereg.status === "usada" ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {prereg.status === "cancelada"
                        ? "Cancelado"
                        : expired
                          ? "Vencido"
                          : "Vigente"}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{formatDate(expiresOn)}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={draft}
                            onChange={(e) =>
                              setExtensionDrafts((prev) => ({ ...prev, [prereg.id]: e.target.value }))
                            }
                            className="rounded-md border border-line bg-card px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={extensionSavingId === prereg.id || draft === expiresOn}
                            onClick={() => saveExtension(prereg.id, draft)}
                            className="text-xs font-medium text-accent hover:text-accent-dark disabled:opacity-50"
                          >
                            Guardar
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!checkoutTarget}
        title="¿Registrar la salida de este visitante?"
        message={checkoutTarget ? `Se registrará la salida de ${checkoutTarget.visitor_name}.` : undefined}
        onConfirm={() => {
          if (checkoutTarget) handleCheckout(checkoutTarget.id);
          setCheckoutTarget(null);
        }}
        onCancel={() => setCheckoutTarget(null)}
      />
    </div>
  );
}
