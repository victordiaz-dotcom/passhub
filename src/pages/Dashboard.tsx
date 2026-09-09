import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
                className="input-field h-auto py-2 disabled:opacity-50"
              />
              <button type="button" onClick={loadVisits} className="btn-secondary">
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
      <div className="mb-6 flex justify-end">
        <Link to="/catalogos" className="text-sm font-medium text-accent hover:text-accent-dark">
          Administrar empresas, divisiones y tipos de visita →
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {viewMode === "fecha" ? (
          <>
            <div className="card">
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
        <div className="card">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Empresas con actividad
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">{companiesActive}</p>
        </div>
      </div>

      {checkoutError && <p className="mb-3 text-sm text-danger">{checkoutError}</p>}

      <div className="card overflow-x-auto p-0">
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
