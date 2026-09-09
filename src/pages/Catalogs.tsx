import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;
type Division = Tables<"divisions"> & { companies: Pick<Tables<"companies">, "name"> | null };
type VisitType = Tables<"visit_types">;

type Tab = "empresas" | "divisiones" | "tipos";

export default function Catalogs() {
  const [tab, setTab] = useState<Tab>("empresas");

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 font-display text-xl font-bold text-ink">Catálogos</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Empresas anfitrionas, divisiones y tipos de visita que alimentan los desplegables de
        Registrar visita y el pre-registro público. Desactivar una fila no la borra ni afecta el
        historial — solo deja de aparecer como opción nueva.
      </p>

      <div className="mb-6 flex w-fit rounded-md border border-line bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("empresas")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            tab === "empresas" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          Empresas anfitrionas
        </button>
        <button
          type="button"
          onClick={() => setTab("divisiones")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            tab === "divisiones" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          Divisiones
        </button>
        <button
          type="button"
          onClick={() => setTab("tipos")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            tab === "tipos" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          Tipos de visita
        </button>
      </div>

      {tab === "empresas" && <CompaniesTab />}
      {tab === "divisiones" && <DivisionsTab />}
      {tab === "tipos" && <VisitTypesTab />}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium ${
        active ? "bg-accent-tint text-accent-dark" : "bg-line text-ink-soft"
      }`}
    >
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

function CompaniesTab() {
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("companies").select("*").order("name");
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    const { error: insertError } = await supabase.from("companies").insert({ name: trimmed });
    setSaving(false);

    if (insertError) {
      setError(insertError.code === "23505" ? "Esa empresa ya existe." : "No se pudo agregar la empresa.");
      return;
    }

    setName("");
    load();
  }

  async function toggleActive(row: Company) {
    await supabase.from("companies").update({ active: !row.active }).eq("id", row.id);
    load();
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Nombre de la empresa"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field h-auto max-w-xs py-2"
        />
        <button type="submit" disabled={saving || !name.trim()} className="btn-primary">
          Agregar
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-ink-soft">
                  No hay empresas registradas.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-ink">{row.name}</td>
                <td className="px-4 py-3">
                  <StatusPill active={row.active} />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleActive(row)}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    {row.active ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DivisionsTab() {
  const [rows, setRows] = useState<Division[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("divisions")
      .select("*, companies(name)")
      .order("name");
    setRows((data as Division[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    supabase
      .from("companies")
      .select("*")
      .order("name")
      .then(({ data }) => setCompanies(data ?? []));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed || !companyId) {
      setError("Selecciona la empresa y escribe el nombre de la división.");
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase
      .from("divisions")
      .insert({ name: trimmed, company_id: companyId });
    setSaving(false);

    if (insertError) {
      setError(
        insertError.code === "23505" ? "Esa división ya existe en esa empresa." : "No se pudo agregar la división."
      );
      return;
    }

    setName("");
    load();
  }

  async function toggleActive(row: Division) {
    await supabase.from("divisions").update({ active: !row.active }).eq("id", row.id);
    load();
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="input-field h-auto max-w-xs py-2"
        >
          <option value="">Selecciona una empresa</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Nombre de la división"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field h-auto max-w-xs py-2"
        />
        <button type="submit" disabled={saving || !name.trim() || !companyId} className="btn-primary">
          Agregar
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-soft">
                  No hay divisiones registradas.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-ink">{row.name}</td>
                <td className="px-4 py-3 text-ink-soft">{row.companies?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusPill active={row.active} />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleActive(row)}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    {row.active ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VisitTypesTab() {
  const [rows, setRows] = useState<VisitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("visit_types").select("*").order("name");
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    const { error: insertError } = await supabase.from("visit_types").insert({ name: trimmed });
    setSaving(false);

    if (insertError) {
      setError(insertError.code === "23505" ? "Ese tipo de visita ya existe." : "No se pudo agregar el tipo de visita.");
      return;
    }

    setName("");
    load();
  }

  async function toggleActive(row: VisitType) {
    await supabase.from("visit_types").update({ active: !row.active }).eq("id", row.id);
    load();
  }

  return (
    <div>
      <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Nombre del tipo de visita"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field h-auto max-w-xs py-2"
        />
        <button type="submit" disabled={saving || !name.trim()} className="btn-primary">
          Agregar
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-ink-soft">
                  No hay tipos de visita registrados.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-ink">{row.name}</td>
                <td className="px-4 py-3">
                  <StatusPill active={row.active} />
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleActive(row)}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    {row.active ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
