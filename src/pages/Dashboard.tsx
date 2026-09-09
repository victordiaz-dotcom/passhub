import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AnalyticsSection } from "@/components/analytics/AnalyticsSection";
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
  | "company_id"
  | "created_by_name"
  | "checked_out_by_name"
> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
};

type VisitType = Pick<Tables<"visit_types">, "id" | "name">;

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initialOf(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export default function Dashboard() {
  const { session } = useAuth();
  const [viewMode, setViewMode] = useState<"fecha" | "dentro" | "analiticas">("fecha");
  const [date, setDate] = useState(todayLocal());
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<VisitRow | null>(null);

  const [visitTypes, setVisitTypes] = useState<VisitType[]>([]);
  const [newVisitType, setNewVisitType] = useState("");
  const [visitTypeError, setVisitTypeError] = useState<string | null>(null);
  const [visitTypeSaving, setVisitTypeSaving] = useState(false);
  const [showVisitTypes, setShowVisitTypes] = useState(false);

  async function loadVisitTypes() {
    const { data } = await supabase.from("visit_types").select("id, name").order("name");
    setVisitTypes(data ?? []);
  }

  useEffect(() => {
    loadVisitTypes();
  }, []);

  async function addVisitType(e: React.FormEvent) {
    e.preventDefault();
    setVisitTypeError(null);

    const name = newVisitType.trim();
    if (!name) return;

    setVisitTypeSaving(true);
    const { error } = await supabase.from("visit_types").insert({ name });
    setVisitTypeSaving(false);

    if (error) {
      setVisitTypeError(
        error.code === "23505" ? "Ese tipo de visita ya existe." : "No se pudo agregar el tipo de visita."
      );
      return;
    }

    setNewVisitType("");
    loadVisitTypes();
  }

  async function deleteVisitType(id: string) {
    setVisitTypeError(null);
    const { error } = await supabase.from("visit_types").delete().eq("id", id);
    if (error) {
      setVisitTypeError("No se pudo eliminar el tipo de visita.");
      return;
    }
    loadVisitTypes();
  }

  async function loadVisits() {
    if (viewMode === "analiticas") return;

    setLoading(true);
    // Sin filtro de company_id: admin ve todas las empresas por diseño
    // (RLS ya scoping esto — recepción, si algún día accede aquí, solo
    // vería las de su propia empresa sin que este código cambie).
    let query = supabase
      .from("visits")
      .select(
        "id, folio, visitor_name, check_in_at, check_out_at, status, company_id, created_by_name, checked_out_by_name, employees(full_name)"
      )
      .order("check_in_at", { ascending: false });

    if (viewMode === "fecha") {
      query = query.eq("visit_date", date);
    } else {
      query = query.eq("status", "dentro");
    }

    const { data } = await query;
    setVisits((data as VisitRow[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, date]);

  async function handleCheckout(visitId: string) {
    if (!session?.user) return;
    setCheckoutError(null);

    // Admin (y recepción, y super admin, que también carga el rol admin)
    // puede cerrar cualquier visita sin restricción, sin importar quién la
    // haya registrado.
    const { error } = await checkoutVisit(visitId, session.user.id);

    if (error) {
      console.error(error);
      setCheckoutError("No se pudo registrar la salida. Intenta de nuevo.");
      return;
    }

    loadVisits();
  }

  const insideCount = visits.filter((visit) => visit.status === "dentro").length;
  const companiesActive = new Set(visits.map((visit) => visit.company_id)).size;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-ink">Panel de control</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-line bg-card p-1">
            <button
              type="button"
              onClick={() => setViewMode("fecha")}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                viewMode === "fecha" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              Por fecha
            </button>
            <button
              type="button"
              onClick={() => setViewMode("dentro")}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                viewMode === "dentro" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              Visitantes dentro
            </button>
            <button
              type="button"
              onClick={() => setViewMode("analiticas")}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                viewMode === "analiticas" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              Analíticas
            </button>
          </div>
          {viewMode !== "analiticas" && (
            <>
              <input
                type="date"
                disabled={viewMode === "dentro"}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={loadVisits}
                className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:bg-paper"
              >
                Actualizar
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === "analiticas" ? (
        <AnalyticsSection />
      ) : (
        <>
      <div className="mb-6 rounded-lg border border-line bg-card p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setShowVisitTypes((prev) => !prev)}
          className="text-sm font-medium text-accent hover:text-accent-dark"
        >
          {showVisitTypes ? "Ocultar tipos de visita" : "Administrar tipos de visita"}
        </button>

        {showVisitTypes && (
          <div className="mt-3">
            <div className="mb-3 flex flex-wrap gap-2">
              {visitTypes.map((type) => (
                <span
                  key={type.id}
                  className="flex items-center gap-2 rounded-full bg-accent-tint px-3 py-1 text-sm text-accent-dark"
                >
                  {type.name}
                  <button
                    type="button"
                    onClick={() => deleteVisitType(type.id)}
                    className="text-accent-dark/60 hover:text-accent-dark"
                    aria-label={`Eliminar ${type.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {visitTypes.length === 0 && (
                <span className="text-sm text-ink-soft">No hay tipos de visita registrados.</span>
              )}
            </div>

            <form onSubmit={addVisitType} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Nuevo tipo de visita"
                value={newVisitType}
                onChange={(e) => setNewVisitType(e.target.value)}
                className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={visitTypeSaving || !newVisitType.trim()}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
              >
                Agregar
              </button>
            </form>
            {visitTypeError && <p className="mt-2 text-sm text-danger">{visitTypeError}</p>}
          </div>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {viewMode === "fecha" ? (
          <>
            <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">Visitas hoy</p>
              <p className="mt-1 font-display text-2xl font-bold text-ink">{visits.length}</p>
            </div>
            <div className="rounded-lg border border-accent bg-accent-tint p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-accent-dark">
                Actualmente dentro
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-accent-dark">{insideCount}</p>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-accent bg-accent-tint p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-accent-dark">
              Actualmente dentro
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-accent-dark">{visits.length}</p>
          </div>
        )}
        <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Empresas con actividad
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{companiesActive}</p>
        </div>
      </div>

      {checkoutError && <p className="mb-3 text-sm text-danger">{checkoutError}</p>}

      <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-sm">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Visitante</th>
              <th className="px-4 py-3 font-medium">Folio</th>
              <th className="px-4 py-3 font-medium">A quién visita</th>
              <th className="px-4 py-3 font-medium">Registró</th>
              <th className="px-4 py-3 font-medium">Hora de entrada</th>
              <th className="px-4 py-3 font-medium">Hora de salida</th>
              <th className="px-4 py-3 font-medium">Marcó salida</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && visits.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-ink-soft">
                  {viewMode === "fecha"
                    ? "No hay visitas registradas para esta fecha."
                    : "No hay visitantes dentro en este momento."}
                </td>
              </tr>
            )}
            {visits.map((visit) => (
              <tr key={visit.id} className="border-b border-line last:border-0">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-tint font-display text-xs font-bold text-accent-dark">
                      {initialOf(visit.visitor_name)}
                    </span>
                    <span className="font-medium text-ink">{visit.visitor_name}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-ink-soft">{visit.folio}</td>
                <td className="px-4 py-4 text-ink-soft">{visit.employees?.full_name ?? "—"}</td>
                <td className="px-4 py-4 text-ink-soft">{visit.created_by_name ?? "—"}</td>
                <td className="px-4 py-4 text-ink-soft">{formatTime(visit.check_in_at)}</td>
                <td className="px-4 py-4 text-ink-soft">{formatTime(visit.check_out_at)}</td>
                <td className="px-4 py-4 text-ink-soft">{visit.checked_out_by_name ?? "—"}</td>
                <td className="px-4 py-4">
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
                <td className="px-4 py-4">
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
        </>
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
