import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

type Account = Tables<"profiles"> & {
  companies: Pick<Tables<"companies">, "name"> | null;
  user_roles: Pick<Tables<"user_roles">, "role">[];
};
type Company = Pick<Tables<"companies">, "id" | "name">;

const emptyForm = { email: "", fullName: "", companyId: "", role: "recepcion" };

export default function Users() {
  const { session } = useAuth();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{
    email: string;
    tempPassword: string;
    context: "creada" | "restablecida";
  } | null>(null);

  const isEditing = editingId !== null;

  async function loadAccounts() {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*, companies(name), user_roles(role)")
      .order("full_name");
    setAccounts((data as Account[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAccounts();
    supabase
      .from("companies")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCompanies(data ?? []));
  }, []);

  function startEdit(account: Account) {
    setError(null);
    setEditingId(account.id);
    setForm({
      email: account.email,
      fullName: account.full_name,
      companyId: account.company_id ?? "",
      role: account.user_roles[0]?.role ?? "recepcion",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  async function handleCreate() {
    const { data, error: invokeError } = await supabase.functions.invoke("create-user", {
      body: {
        email: form.email,
        fullName: form.fullName,
        companyId: form.companyId,
        role: form.role,
      },
    });

    if (invokeError || data?.error) {
      setError(data?.error ?? "No se pudo crear la cuenta. Intenta de nuevo.");
      return false;
    }

    setTempPasswordInfo({ email: data.email, tempPassword: data.tempPassword, context: "creada" });
    return true;
  }

  async function handleUpdate() {
    if (!editingId) return false;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: form.fullName, company_id: form.companyId })
      .eq("id", editingId);

    if (profileError) {
      setError("No se pudo actualizar el colaborador.");
      return false;
    }

    const { error: deleteRoleError } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", editingId);

    if (deleteRoleError) {
      setError("No se pudo actualizar el rol.");
      return false;
    }

    const { error: insertRoleError } = await supabase
      .from("user_roles")
      .insert({ user_id: editingId, role: form.role as "admin" | "recepcion" });

    if (insertRoleError) {
      setError("No se pudo actualizar el rol.");
      return false;
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.companyId) {
      setError("Selecciona una empresa.");
      return;
    }

    setSaving(true);
    const ok = isEditing ? await handleUpdate() : await handleCreate();
    setSaving(false);

    if (!ok) return;

    setEditingId(null);
    setForm(emptyForm);
    loadAccounts();
  }

  async function handleResetPassword(account: Account) {
    setError(null);
    setResettingId(account.id);

    const { data, error: invokeError } = await supabase.functions.invoke("reset-user-password", {
      body: { userId: account.id },
    });

    setResettingId(null);

    if (invokeError || data?.error) {
      setError(data?.error ?? "No se pudo restablecer la contraseña.");
      return;
    }

    setTempPasswordInfo({ email: data.email, tempPassword: data.tempPassword, context: "restablecida" });
  }

  async function toggleActive(account: Account) {
    if (account.active) {
      const confirmed = window.confirm(
        `¿Desactivar a ${account.full_name}? Perderá acceso de inmediato. Su historial de visitas y auditoría no se borra, y puedes reactivarla cuando quieras.`
      );
      if (!confirmed) return;
    }

    await supabase.from("profiles").update({ active: !account.active }).eq("id", account.id);
    loadAccounts();
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 font-display text-xl font-bold text-ink">Cuentas</h1>

      {tempPasswordInfo && (
        <div className="mb-6 rounded-lg border border-warn bg-warn-tint p-4">
          <p className="text-sm font-medium text-ink">
            Contraseña {tempPasswordInfo.context} para{" "}
            <span className="font-bold">{tempPasswordInfo.email}</span>
          </p>
          <p className="mt-2 text-sm text-ink-soft">Contraseña temporal (solo se muestra una vez):</p>
          <p className="mt-1 font-display text-lg font-bold text-ink">{tempPasswordInfo.tempPassword}</p>
          <p className="mt-2 text-xs text-ink-soft">
            Cópiala y entrégasela a la persona en persona o por un canal seguro.
          </p>
          <button
            type="button"
            onClick={() => setTempPasswordInfo(null)}
            className="mt-3 text-sm font-medium text-accent hover:text-accent-dark"
          >
            Entendido
          </button>
        </div>
      )}

      <div className="mb-6 rounded-lg border border-line bg-card p-6 shadow-sm">
        <h2 className="mb-4 font-display text-base font-bold text-ink">
          {isEditing ? "Editar cuenta" : "Nueva cuenta"}
        </h2>

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-ink-soft">
              Nombre completo
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
              required
              disabled={isEditing}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none disabled:bg-paper disabled:text-ink-soft"
            />
            {isEditing && (
              <p className="mt-1 text-xs text-ink-soft">El correo no se puede editar aquí.</p>
            )}
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

          <div>
            <label htmlFor="role" className="mb-1 block text-sm font-medium text-ink-soft">
              Rol
            </label>
            <select
              id="role"
              required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="recepcion">Recepción</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear cuenta"}
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
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading && accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-soft">
                  No hay cuentas registradas.
                </td>
              </tr>
            )}
            {accounts.map((account) => {
              const isSelf = account.id === session?.user.id;
              return (
                <tr key={account.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{account.full_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{account.email}</td>
                  <td className="px-4 py-3 text-ink-soft">{account.companies?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {account.user_roles.map((r) => r.role).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        account.active ? "bg-accent-tint text-accent-dark" : "bg-line text-ink-soft"
                      }`}
                    >
                      {account.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => startEdit(account)}
                        className="text-sm font-medium text-accent hover:text-accent-dark"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={resettingId === account.id}
                        onClick={() => handleResetPassword(account)}
                        className="text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-50"
                      >
                        {resettingId === account.id ? "Restableciendo..." : "Restablecer contraseña"}
                      </button>
                      <button
                        type="button"
                        disabled={isSelf}
                        title={
                          isSelf
                            ? "No puedes desactivar tu propia cuenta."
                            : account.active
                              ? "Bloquea el acceso de la persona. No borra su cuenta ni su historial."
                              : "Restaura su acceso."
                        }
                        onClick={() => toggleActive(account)}
                        className="text-sm font-medium text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {account.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-ink-soft">
        Desactivar bloquea el acceso de la persona de inmediato; no borra la cuenta ni su historial de
        visitas o auditoría, y puede reactivarse cuando quieras.
      </p>
    </div>
  );
}
