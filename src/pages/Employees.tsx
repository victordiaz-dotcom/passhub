import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Employee = Tables<"employees"> & { companies: Pick<Tables<"companies">, "name"> | null };
type Company = Pick<Tables<"companies">, "id" | "name">;

const emptyForm = { id: "", fullName: "", email: "", companyId: "" };

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = form.id !== "";

  async function loadEmployees() {
    setLoading(true);
    const { data } = await supabase
      .from("employees")
      .select("*, companies(name)")
      .order("full_name");
    setEmployees((data as Employee[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadEmployees();
    supabase
      .from("companies")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCompanies(data ?? []));
  }, []);

  function startEdit(employee: Employee) {
    setError(null);
    setForm({
      id: employee.id,
      fullName: employee.full_name,
      email: employee.email ?? "",
      companyId: employee.company_id,
    });
  }

  function cancelEdit() {
    setForm(emptyForm);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.companyId) {
      setError("Selecciona una empresa.");
      return;
    }

    setSaving(true);

    const payload = {
      full_name: form.fullName,
      email: form.email || null,
      company_id: form.companyId,
    };

    const { error: saveError } = isEditing
      ? await supabase.from("employees").update(payload).eq("id", form.id)
      : await supabase.from("employees").insert(payload);

    setSaving(false);

    if (saveError) {
      setError("No se pudo guardar el colaborador. Intenta de nuevo.");
      return;
    }

    setForm(emptyForm);
    loadEmployees();
  }

  async function toggleActive(employee: Employee) {
    await supabase.from("employees").update({ active: !employee.active }).eq("id", employee.id);
    loadEmployees();
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 font-display text-xl font-bold text-ink">Colaboradores</h1>

      <div className="mb-6 rounded-lg border border-line bg-card p-6 shadow-sm">
        <h2 className="mb-4 font-display text-base font-bold text-ink">
          {isEditing ? "Editar colaborador" : "Nuevo colaborador"}
        </h2>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-ink-soft">
              Nombre
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-soft">
              Correo
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="company" className="mb-1 block text-sm font-medium text-ink-soft">
              Empresa
            </label>
            <select
              id="company"
              required
              value={form.companyId}
              onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="" disabled>
                Selecciona una empresa
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar colaborador"}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink-soft hover:bg-paper"
              >
                Cancelar
              </button>
            )}
          </div>

          {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
        </form>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Correo</th>
              <th className="px-4 py-3 font-medium">Empresa</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && employees.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                  No hay colaboradores registrados.
                </td>
              </tr>
            )}
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-ink">{employee.full_name}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.email ?? "—"}</td>
                <td className="px-4 py-3 text-ink-soft">{employee.companies?.name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      employee.active ? "bg-accent-tint text-accent-dark" : "bg-line text-ink-soft"
                    }`}
                  >
                    {employee.active ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => startEdit(employee)}
                      className="text-sm font-medium text-accent hover:text-accent-dark"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(employee)}
                      className="text-sm font-medium text-ink-soft hover:text-ink"
                    >
                      {employee.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
