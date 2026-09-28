import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countryFlags";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { TableSkeletonRows } from "@/components/Skeleton";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees"> & { companies: Pick<Tables<"companies">, "name"> | null };
type SyncCountry = "MX" | "ES";
const SYNC_COUNTRIES: SyncCountry[] = ["MX", "ES"];
const FILTER_COUNTRIES = ["MX", "ES", "FR", "IT", "CO"];

export default function Employees() {
  const { profile, isSuperadmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [officeCountry, setOfficeCountry] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState("");
  const [syncing, setSyncing] = useState<SyncCountry | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (isSuperadmin || !profile?.office_id) return;
    let cancelled = false;
    supabase.from("offices").select("country").eq("id", profile.office_id).single().then(({ data }) => {
      if (!cancelled) setOfficeCountry(data?.country ?? null);
    });
    return () => { cancelled = true; };
  }, [isSuperadmin, profile?.office_id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    let query = supabase
      .from("employees")
      .select("*, companies(name)")
      .eq("active", true)
      .order("full_name");
    // RLS limita a cada admin a su oficina. Solo superadmin puede pedir otro país.
    if (isSuperadmin && countryFilter) query = query.eq("country", countryFilter);
    query.then(({ data, error }) => {
      if (cancelled) return;
      setEmployees((data as Employee[] | null) ?? []);
      setLoadError(error ? "No se pudieron cargar los colaboradores." : null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isSuperadmin, countryFilter, refreshKey]);

  async function handleSync(country: SyncCountry) {
    setSyncMessage(null);
    setSyncing(country);
    const { data, error: invokeError } = await supabase.functions.invoke("sync-employees", {
      body: { country },
    });
    setSyncing(null);

    if (invokeError) {
      const message = await edgeFunctionErrorMessage(invokeError, "No se pudo sincronizar. Intenta de nuevo.");
      setSyncMessage({ text: message, isError: true });
      return;
    }
    if (data?.error) {
      setSyncMessage({ text: data.error, isError: true });
      return;
    }

    setSyncMessage({ text: `Se sincronizaron ${data.synced} colaboradores de ${COUNTRY_LABELS[country]}.`, isError: false });
    setRefreshKey((value) => value + 1);
  }

  const availableSyncCountries = isSuperadmin
    ? SYNC_COUNTRIES
    : SYNC_COUNTRIES.filter((country) => country === officeCountry);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-bold text-ink">Colaboradores</h1>
        <div className="flex flex-wrap gap-2">
          {availableSyncCountries.map((country) => (
            <button
              key={country}
              type="button"
              onClick={() => handleSync(country)}
              disabled={syncing !== null}
              className="btn-secondary"
            >
              {syncing === country ? "Sincronizando..." : `Sincronizar ${COUNTRY_LABELS[country]}`}
            </button>
          ))}
        </div>
      </div>

      {isSuperadmin && (
        <div className="mb-4 w-48">
          <label htmlFor="employeeCountryFilter" className="mb-1 block text-xs font-medium text-ink-soft">País</label>
          <select
            id="employeeCountryFilter"
            value={countryFilter}
            onChange={(event) => setCountryFilter(event.target.value)}
            className="input-field h-auto py-2"
          >
            <option value="">Todos</option>
            {FILTER_COUNTRIES.map((country) => (
              <option key={country} value={country}>{COUNTRY_FLAGS[country]} {COUNTRY_LABELS[country]}</option>
            ))}
          </select>
        </div>
      )}

      {syncMessage && (
        <p className={`mb-4 text-sm ${syncMessage.isError ? "text-danger" : "text-accent-dark"}`}>
          {syncMessage.text}
        </p>
      )}
      {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}

      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="tbl-head border-b border-line text-ink-soft">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Nombre</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Correo</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Empresa</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">País</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeletonRows rows={5} columns={4} />}
            {!loading && employees.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                  No hay colaboradores registrados.
                </td>
              </tr>
            )}
            {!loading && employees.map((employee) => (
              <tr key={employee.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-ink">{employee.full_name}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.email ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.companies?.name ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.country ? `${COUNTRY_FLAGS[employee.country] ?? ""} ${COUNTRY_LABELS[employee.country] ?? employee.country}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
