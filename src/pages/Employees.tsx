import { useEffect, useLayoutEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { COUNTRY_LABELS } from "@/lib/countryFlags";
import { CountryFlag } from "@/components/CountryFlag";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableSkeletonRows } from "@/components/Skeleton";
import { clearViewCache, coalesceViewRequest, readViewCache, writeViewCache } from "@/lib/viewCache";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees"> & { companies: Pick<Tables<"companies">, "name"> | null };
type SyncCountry = "MX" | "ES";
const SYNC_COUNTRIES: SyncCountry[] = ["MX", "ES"];
const FILTER_COUNTRIES: SyncCountry[] = ["MX", "ES"];
const EUROPE_COUNTRIES = ["ES", "FR", "IT"] as const;

export default function Employees() {
  const { session, profile, isSuperadmin } = useAuth();
  const [countryFilter, setCountryFilter] = useState("");
  const [europeCountryFilter, setEuropeCountryFilter] = useState("");
  const [employeeSearchInput, setEmployeeSearchInput] = useState("");
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const queryKey = `${isSuperadmin}:${profile?.office_id ?? ""}:${countryFilter}:${europeCountryFilter}:${refreshKey}`;
  const cacheKey = `employees:${session?.user?.id ?? ""}:${queryKey}`;
  const [employees, setEmployees] = useState<Employee[]>(() => readViewCache<Employee[]>(cacheKey)?.value ?? []);
  const [loading, setLoading] = useState(() => !readViewCache<Employee[]>(cacheKey));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [officeCountry, setOfficeCountry] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<SyncCountry | null>(null);
  const [syncTarget, setSyncTarget] = useState<SyncCountry | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(() => readViewCache<Employee[]>(cacheKey) ? queryKey : null);
  const showingSkeleton = loading || loadedQueryKey !== queryKey;
  const normalizedSearch = employeeSearchQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visibleEmployees = normalizedSearch
    ? employees.filter((employee) =>
        [employee.full_name, employee.email ?? ""].some((value) =>
          value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalizedSearch)
        )
      )
    : employees;

  useEffect(() => {
    if (isSuperadmin || !profile?.office_id) return;
    let cancelled = false;
    supabase.from("offices").select("country").eq("id", profile.office_id).single().then(({ data }) => {
      if (!cancelled) setOfficeCountry(data?.country ?? null);
    });
    return () => { cancelled = true; };
  }, [isSuperadmin, profile?.office_id]);

  useLayoutEffect(() => {
    let cancelled = false;
    const cached = readViewCache<Employee[]>(cacheKey);
    if (cached) {
      setEmployees(cached.value);
      setLoadedQueryKey(queryKey);
      setLoading(false);
      if (cached.fresh) return;
    } else {
      setLoading(true);
    }
    setLoadError(null);
    let query = supabase
      .from("employees")
      .select("*, companies(name)")
      .eq("active", true)
      .order("full_name");
    // La operación tiene dos grupos: México y España. Francia e Italia se
    // atienden desde España y aparecen al elegir ese país.
    if (isSuperadmin && countryFilter === "MX") {
      query = query.eq("country", "MX");
    } else if (isSuperadmin && countryFilter === "ES") {
      query = europeCountryFilter
        ? query.eq("country", europeCountryFilter)
        : query.in("country", [...EUROPE_COUNTRIES]);
    } else {
      query = query.in("country", ["MX", "ES", "FR", "IT"]);
    }
    void coalesceViewRequest(cacheKey, async () => await query).then(({ data, error }) => {
      if (cancelled) return;
      if (!error) {
        const rows = (data as Employee[] | null) ?? [];
        setEmployees(rows);
        writeViewCache(cacheKey, rows);
      }
      setLoadError(error ? "No se pudieron cargar los colaboradores." : null);
      setLoadedQueryKey(queryKey);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isSuperadmin, profile?.office_id, countryFilter, europeCountryFilter, refreshKey, session?.user?.id]);

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

    setSyncMessage({ text: `Se sincronizaron ${data.synced} colaboradores de ${country === "ES" ? "Europa" : COUNTRY_LABELS[country]}.`, isError: false });
    clearViewCache("employees:");
    setRefreshKey((value) => value + 1);
  }

  const availableSyncCountries = isSuperadmin
    ? SYNC_COUNTRIES
    : SYNC_COUNTRIES.filter((country) => country === officeCountry);

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Colaboradores"
        description="Consulta el directorio y actualiza los colaboradores de cada país."
        actions={
          <div className="flex flex-wrap gap-2">
            {availableSyncCountries.map((country) => (
              <button
                key={country}
                type="button"
                onClick={() => setSyncTarget(country)}
                disabled={syncing !== null}
                aria-label={`Sincronizar colaboradores de ${country === "ES" ? "Europa (España, Francia e Italia)" : COUNTRY_LABELS[country]}`}
                title={`Sincronizar colaboradores de ${country === "ES" ? "Europa (España, Francia e Italia)" : COUNTRY_LABELS[country]}`}
                className="btn-secondary inline-flex h-12 w-20 items-center justify-center gap-2"
              >
                <RefreshCw size={26} strokeWidth={2.5} aria-hidden="true" className={syncing === country ? "animate-spin" : ""} />
                <CountryFlag code={country === "ES" ? "EU" : country} className="h-5 w-[30px]" />
              </button>
            ))}
          </div>
        }
      />

      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <form onSubmit={(event) => { event.preventDefault(); setEmployeeSearchQuery(employeeSearchInput); }} className="flex items-end gap-2">
          <div>
            <label htmlFor="employeeSearch" className="mb-1 block text-xs font-medium text-ink-soft">Buscar colaborador</label>
            <input
              id="employeeSearch"
              type="search"
              value={employeeSearchInput}
              onChange={(event) => {
                setEmployeeSearchInput(event.target.value);
                if (!event.target.value) setEmployeeSearchQuery("");
              }}
              placeholder="Nombre o correo"
              className="input-field h-10 w-56 py-2"
            />
          </div>
          <button type="submit" className="btn-secondary inline-flex h-10 items-center gap-2" aria-label="Buscar colaborador">
            <Search size={16} aria-hidden="true" /> Buscar
          </button>
        </form>
        {isSuperadmin && <>
          <div>
          <label htmlFor="employeeCountryFilter" className="mb-1 block text-xs font-medium text-ink-soft">País</label>
          <div className="flex items-center gap-2">
          <CountryFlag code={countryFilter === "ES" ? "EU" : countryFilter} />
          <select
            id="employeeCountryFilter"
            value={countryFilter}
            onChange={(event) => { setCountryFilter(event.target.value); setEuropeCountryFilter(""); }}
            className="input-field h-auto w-48 py-2"
          >
            <option value="">Todos</option>
            {FILTER_COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {country === "ES" ? "Europa" : COUNTRY_LABELS[country]}
              </option>
            ))}
          </select>
          </div>
          </div>
          <div className={countryFilter === "ES" ? "" : "invisible pointer-events-none"} aria-hidden={countryFilter !== "ES"}>
            <label htmlFor="employeeEuropeFilter" className="mb-1 block text-xs font-medium text-ink-soft">Europa</label>
            <div className="flex items-center gap-2">
            <CountryFlag code={europeCountryFilter || "EU"} />
            <select id="employeeEuropeFilter" value={countryFilter === "ES" ? europeCountryFilter : ""} disabled={countryFilter !== "ES"} onChange={(event) => setEuropeCountryFilter(event.target.value)} className="input-field h-auto w-48 py-2">
              <option value="">Toda Europa</option>
              {EUROPE_COUNTRIES.map((country) => <option key={country} value={country}>{COUNTRY_LABELS[country]}</option>)}
            </select>
            </div>
          </div>
        </>}
      </div>

      {syncMessage && (
        <p className={`mb-4 text-sm ${syncMessage.isError ? "text-danger" : "text-accent-dark"}`}>
          {syncMessage.text}
        </p>
      )}
      {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}

      <div className="card min-h-80 overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="tbl-head border-b border-line text-ink-soft">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Nombre</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Correo</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Empresa</th>
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest">País</th>
            </tr>
          </thead>
          <tbody>
            {showingSkeleton && <TableSkeletonRows rows={Math.max(5, Math.min(employees.length, 10))} columns={4} />}
            {!showingSkeleton && visibleEmployees.length === 0 && (
              <tr>
                <td colSpan={4} className="h-64 px-4 py-6 text-center align-middle text-ink-soft">
                  {normalizedSearch || countryFilter ? "No hay colaboradores que coincidan con estos filtros." : "No hay colaboradores registrados."}
                </td>
              </tr>
            )}
            {!showingSkeleton && visibleEmployees.map((employee) => (
              <tr key={employee.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-ink">{employee.full_name}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.email ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.companies?.name ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.country ? <><CountryFlag code={employee.country} className="mr-1 h-3 w-[18px]" />{COUNTRY_LABELS[employee.country] ?? employee.country}</> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={syncTarget !== null}
        title={`¿Sincronizar colaboradores de ${syncTarget === "ES" ? "Europa" : "México"}?`}
        message="Este botón es solo para cuando no te aparece el colaborador de la persona a quien visitas."
        confirmLabel="Sincronizar"
        cancelLabel="Cancelar"
        variant="warning"
        onConfirm={() => { const country = syncTarget; setSyncTarget(null); if (country) void handleSync(country); }}
        onCancel={() => setSyncTarget(null)}
      />
    </PageShell>
  );
}
