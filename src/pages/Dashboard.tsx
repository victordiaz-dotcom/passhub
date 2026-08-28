import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type VisitRow = Pick<Tables<"visits">, "id" | "folio" | "visitor_name" | "check_in_at" | "status"> & {
  employees: Pick<Tables<"employees">, "full_name"> | null;
};

function todayLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export default function Dashboard() {
  const [date, setDate] = useState(todayLocal());
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadVisits() {
    setLoading(true);
    const { data } = await supabase
      .from("visits")
      .select("id, folio, visitor_name, check_in_at, status, employees(full_name)")
      .eq("visit_date", date)
      .order("check_in_at", { ascending: false });
    setVisits((data as VisitRow[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadVisits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Visitas</h1>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={loadVisits}
            className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:bg-paper"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Folio</th>
              <th className="px-4 py-3 font-medium">Visitante</th>
              <th className="px-4 py-3 font-medium">A quién visita</th>
              <th className="px-4 py-3 font-medium">Hora de entrada</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {!loading && visits.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                  No hay visitas registradas para esta fecha.
                </td>
              </tr>
            )}
            {visits.map((visit) => (
              <tr key={visit.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium text-ink">{visit.folio}</td>
                <td className="px-4 py-3 text-ink">{visit.visitor_name}</td>
                <td className="px-4 py-3 text-ink-soft">{visit.employees?.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {new Date(visit.check_in_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
