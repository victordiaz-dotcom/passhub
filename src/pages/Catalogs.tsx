import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Company = Tables<"companies">;
type Division = Tables<"divisions"> & { companies: Pick<Tables<"companies">, "name"> | null };
type VisitType = Tables<"visit_types">;
type PreregField = Tables<"preregistro_fields">;

type Tab = "empresas" | "divisiones" | "tipos" | "campos";

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
        <button
          type="button"
          onClick={() => setTab("campos")}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            tab === "campos" ? "bg-accent text-white" : "text-ink-soft hover:text-ink"
          }`}
        >
          Campos de pre-registro
        </button>
      </div>

      {tab === "empresas" && <CompaniesTab />}
      {tab === "divisiones" && <DivisionsTab />}
      {tab === "tipos" && <VisitTypesTab />}
      {tab === "campos" && <PreregFieldsTab />}
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

// Etiqueta por defecto de cada campo "builtin" (lo que ya muestra
// PreRegistro.tsx cuando el admin no ha puesto un override) — solo para
// que esta tabla sea legible sin tener que adivinar qué es "visitorPhone".
const BUILTIN_LABELS: Record<string, string> = {
  visitorCompany: "Tu empresa",
  visitorPhone: "Teléfono",
  visitorEmail: "Correo electrónico",
  visitType: "Tipo de visita",
  hasVehicle: "¿Traes vehículo?",
  reason: "Motivo",
};

function PreregFieldsTab() {
  const [rows, setRows] = useState<PreregField[]>([]);
  const [loading, setLoading] = useState(true);
  const [labelEs, setLabelEs] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("preregistro_fields").select("*").order("sort_order");
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = labelEs.trim();
    if (!trimmed) {
      setError("Escribe al menos la etiqueta en español.");
      return;
    }

    setSaving(true);
    const maxOrder = rows.reduce((max, r) => Math.max(max, r.sort_order), 0);
    const { error: insertError } = await supabase.from("preregistro_fields").insert({
      kind: "custom",
      // crypto.randomUUID requiere contexto seguro (https/localhost) -- ver
      // randomId() en CheckIn.tsx; aquí este panel solo lo usan admins
      // autenticados, siempre en el mismo dominio que el resto de la app,
      // así que un id corto basado en tiempo+random alcanza para una key
      // única sin depender de esa API.
      field_key: `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      label_es: trimmed,
      label_en: labelEn.trim() || null,
      required,
      sort_order: maxOrder + 10,
    });
    setSaving(false);

    if (insertError) {
      setError("No se pudo agregar el campo.");
      return;
    }

    setLabelEs("");
    setLabelEn("");
    setRequired(false);
    load();
  }

  async function toggleVisible(row: PreregField) {
    await supabase.from("preregistro_fields").update({ visible: !row.visible }).eq("id", row.id);
    load();
  }

  async function toggleRequired(row: PreregField) {
    await supabase.from("preregistro_fields").update({ required: !row.required }).eq("id", row.id);
    load();
  }

  async function move(row: PreregField, direction: "up" | "down") {
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((r) => r.id === row.id);
    const swapWith = direction === "up" ? sorted[idx - 1] : sorted[idx + 1];
    if (!swapWith) return;

    await Promise.all([
      supabase.from("preregistro_fields").update({ sort_order: swapWith.sort_order }).eq("id", row.id),
      supabase.from("preregistro_fields").update({ sort_order: row.sort_order }).eq("id", swapWith.id),
    ]);
    load();
  }

  async function remove(row: PreregField) {
    if (!confirm(`¿Borrar el campo "${row.label_es}"? Esto no afecta pre-registros ya enviados.`)) return;
    await supabase.from("preregistro_fields").delete().eq("id", row.id);
    load();
  }

  const sortedRows = [...rows].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <p className="mb-4 text-sm text-ink-soft">
        Los campos "Existente" ya están en el formulario de pre-registro — aquí solo puedes
        mostrarlos/ocultarlos, marcarlos obligatorios y reordenarlos. Los campos "Nuevo" que agregues
        son de texto libre y se guardan junto al pre-registro; recepción los ve al escanear el QR.
        El nombre, la empresa que visitas y la fecha/hora de la visita siempre se piden y no se
        pueden quitar de aquí.
      </p>

      <form onSubmit={handleAdd} className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Etiqueta (español)</label>
          <input
            type="text"
            placeholder="Ej. Área que visita"
            value={labelEs}
            onChange={(e) => setLabelEs(e.target.value)}
            className="input-field h-auto max-w-xs py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-soft">Etiqueta (inglés, opcional)</label>
          <input
            type="text"
            placeholder="Ej. Area you're visiting"
            value={labelEn}
            onChange={(e) => setLabelEn(e.target.value)}
            className="input-field h-auto max-w-xs py-2"
          />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-sm text-ink">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Obligatorio
        </label>
        <button type="submit" disabled={saving || !labelEs.trim()} className="btn-primary">
          Agregar campo
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Etiqueta</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Visible</th>
              <th className="px-4 py-3 font-medium">Obligatorio</th>
              <th className="px-4 py-3 font-medium">Orden</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && sortedRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
                  No hay campos configurados.
                </td>
              </tr>
            )}
            {sortedRows.map((row, idx) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-ink">
                  {row.label_es || (row.kind === "builtin" ? BUILTIN_LABELS[row.field_key] : row.field_key)}
                  {row.label_en && <span className="text-ink-soft"> / {row.label_en}</span>}
                </td>
                <td className="px-4 py-3 text-ink-soft">{row.kind === "builtin" ? "Existente" : "Nuevo"}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleVisible(row)}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    {row.visible ? "Sí (ocultar)" : "No (mostrar)"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleRequired(row)}
                    className="text-sm font-medium text-ink-soft hover:text-ink"
                  >
                    {row.required ? "Sí" : "No"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => move(row, "up")}
                      className="text-ink-soft hover:text-ink disabled:opacity-30"
                      title="Subir"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={idx === sortedRows.length - 1}
                      onClick={() => move(row, "down")}
                      className="text-ink-soft hover:text-ink disabled:opacity-30"
                      title="Bajar"
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {row.kind === "custom" && (
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      className="text-sm font-medium text-danger hover:underline"
                    >
                      Borrar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
