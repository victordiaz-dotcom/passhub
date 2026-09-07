import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees"> & { companies: Pick<Tables<"companies">, "name"> | null };

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError: boolean } | null>(null);

  async function loadEmployees() {
    setLoading(true);
    // Los inactivos (dados de baja o placeholders de Slack/IA/puestos) no se
    // muestran en absoluto en esta vista — se filtran aquí en la consulta,
    // no solo se ocultan por CSS. Esta vista es de solo lectura: la única
    // acción posible es volver a sincronizar desde el directorio de Slack.
    const { data } = await supabase
      .from("employees")
      .select("*, companies(name)")
      .eq("active", true)
      .order("full_name");
    setEmployees((data as Employee[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  async function handleSync() {
    setSyncMessage(null);
    setSyncing(true);

    const { data, error: invokeError } = await supabase.functions.invoke("sync-employees");

    setSyncing(false);

    if (invokeError) {
      let message = "No se pudo sincronizar. Intenta de nuevo.";
      if (invokeError instanceof FunctionsHttpError) {
        const body = await invokeError.context.json().catch(() => null);
        if (body?.error) message = body.error;
      }
      setSyncMessage({ text: message, isError: true });
      return;
    }

    if (data?.error) {
      setSyncMessage({ text: data.error, isError: true });
      return;
    }

    setSyncMessage({ text: `Se sincronizaron ${data.synced} empleados.`, isError: false });
    loadEmployees();
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-xl font-bold text-ink">Colaboradores</h1>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="rounded-md border border-line px-3 py-2 text-sm font-medium text-ink-soft hover:bg-paper disabled:opacity-50"
        >
          {syncing ? "Sincronizando..." : "Sincronizar empleados"}
        </button>
      </div>

      {syncMessage && (
        <p className={`mb-4 text-sm ${syncMessage.isError ? "text-danger" : "text-accent-dark"}`}>
          {syncMessage.text}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
            </tr>
          </thead>
          <tbody>
            {!loading && employees.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-ink-soft">
                  No hay colaboradores registrados.
                </td>
              </tr>
            )}
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-ink">{employee.full_name}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.email ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.companies?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
