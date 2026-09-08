import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Tables } from "@/integrations/supabase/types";

type Account = Tables<"profiles"> & {
  companies: Pick<Tables<"companies">, "name"> | null;
  user_roles: Pick<Tables<"user_roles">, "role">[];
};
type Company = Pick<Tables<"companies">, "id" | "name">;

const emptyForm = {
  email: "",
  username: "",
  fullName: "",
  companyId: "",
  role: "recepcion",
  passwordMode: "auto" as "auto" | "custom",
  customPassword: "",
};

const ROLE_LABELS: Record<string, string> = {
  recepcion: "Recepción",
  admin: "Admin",
  superadmin: "Super Admin",
  guardia: "Guardia",
};

export default function Users() {
  const { session, isSuperadmin } = useAuth();

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

  const [resetTarget, setResetTarget] = useState<Account | null>(null);
  const [resetMode, setResetMode] = useState<"auto" | "custom">("auto");
  const [resetCustomPassword, setResetCustomPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      username: account.username,
      fullName: account.full_name,
      companyId: account.company_id ?? "",
      role: account.user_roles[0]?.role ?? "recepcion",
      passwordMode: "auto",
      customPassword: "",
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
        username: form.username,
        fullName: form.fullName,
        companyId: form.companyId,
        role: form.role,
        password: form.passwordMode === "custom" ? form.customPassword : undefined,
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
      .update({ full_name: form.fullName, company_id: form.companyId, username: form.username })
      .eq("id", editingId);

    if (profileError) {
      setError(
        profileError.message.includes("profiles_username_lower_idx")
          ? "Ese usuario ya está en uso por otra cuenta."
          : "No se pudo actualizar el colaborador."
      );
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
      .insert({ user_id: editingId, role: form.role as "admin" | "recepcion" | "superadmin" });

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

    if (!isEditing && form.passwordMode === "custom" && form.customPassword.trim().length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
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

  function openResetDialog(account: Account) {
    setResetTarget(account);
    setResetMode("auto");
    setResetCustomPassword("");
    setResetError(null);
  }

  function closeResetDialog() {
    setResetTarget(null);
    setResetError(null);
  }

  async function handleResetPassword() {
    if (!resetTarget) return;

    setResetError(null);

    if (resetMode === "custom" && resetCustomPassword.trim().length < 8) {
      setResetError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setResettingId(resetTarget.id);

    const { data, error: invokeError } = await supabase.functions.invoke("reset-user-password", {
      body: {
        userId: resetTarget.id,
        password: resetMode === "custom" ? resetCustomPassword : undefined,
      },
    });

    setResettingId(null);

    if (invokeError || data?.error) {
      setResetError(data?.error ?? "No se pudo restablecer la contraseña.");
      return;
    }

    setResetTarget(null);
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

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleteError(null);
    setDeletingId(deleteTarget.id);

    const { data, error: invokeError } = await supabase.functions.invoke("delete-user", {
      body: { userId: deleteTarget.id },
    });

    setDeletingId(null);

    if (invokeError || data?.error) {
      setDeleteError(data?.error ?? "No se pudo eliminar la cuenta. Intenta de nuevo.");
      return;
    }

    setDeleteTarget(null);
    loadAccounts();
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
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
            Cópiala y entrégasela en persona o por un canal seguro.
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
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
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
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-ink-soft">
              Usuario
            </label>
            <input
              id="username"
              type="text"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().trim() })}
              className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-ink-soft">Con esto (o el correo) inicia sesión.</p>
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
              <option value="guardia">Guardia</option>
              {isSuperadmin && (
                <>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Super Admin</option>
                </>
              )}
            </select>
            {!isSuperadmin && (
              <p className="mt-1 text-xs text-ink-soft">
                Solo un super admin puede crear o editar cuentas de admin/super admin.
              </p>
            )}
          </div>

          {!isEditing && (
            <div className="sm:col-span-2 border-t border-line pt-4">
              <label className="mb-1 block text-sm font-medium text-ink-soft">Contraseña</label>
              <div className="flex gap-4 text-sm text-ink">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="passwordMode"
                    checked={form.passwordMode === "auto"}
                    onChange={() => setForm({ ...form, passwordMode: "auto", customPassword: "" })}
                  />
                  Generar automáticamente
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="passwordMode"
                    checked={form.passwordMode === "custom"}
                    onChange={() => setForm({ ...form, passwordMode: "custom" })}
                  />
                  Escribir manualmente
                </label>
              </div>
              {form.passwordMode === "custom" && (
                <input
                  type="text"
                  required
                  minLength={8}
                  placeholder="Mínimo 8 caracteres"
                  value={form.customPassword}
                  onChange={(e) => setForm({ ...form, customPassword: e.target.value })}
                  className="mt-2 w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                />
              )}
            </div>
          )}

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

      <h2 className="mb-4 font-display text-base font-bold text-ink">Cuentas registradas</h2>

      {deleteError && <p className="mb-3 text-sm text-danger">{deleteError}</p>}

      <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Usuario</th>
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
                <td colSpan={7} className="px-4 py-6 text-center text-ink-soft">
                  No hay cuentas registradas.
                </td>
              </tr>
            )}
            {accounts.map((account) => {
              const isSelf = account.id === session?.user.id;
              const accountIsElevated = account.user_roles.some(
                (r) => r.role === "admin" || r.role === "superadmin"
              );
              const canEditAccount = isSuperadmin || !accountIsElevated;
              return (
                <tr key={account.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-ink">{account.full_name}</td>
                  <td className="px-4 py-3 text-ink-soft">{account.username}</td>
                  <td className="px-4 py-3 text-ink-soft">{account.email}</td>
                  <td className="px-4 py-3 text-ink-soft">{account.companies?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {account.user_roles.map((r) => ROLE_LABELS[r.role] ?? r.role).join(", ") || "—"}
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
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <button
                        type="button"
                        disabled={!canEditAccount}
                        title={canEditAccount ? undefined : "Solo un super admin puede editar cuentas de admin/super admin."}
                        onClick={() => startEdit(account)}
                        className="text-sm font-medium text-accent hover:text-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Editar
                      </button>
                      {canEditAccount && (
                        <button
                          type="button"
                          disabled={resettingId === account.id}
                          onClick={() => openResetDialog(account)}
                          className="text-sm font-medium text-ink-soft hover:text-ink disabled:opacity-50"
                        >
                          {resettingId === account.id ? "Restableciendo..." : "Restablecer contraseña"}
                        </button>
                      )}
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
                      {isSuperadmin && (
                        <button
                          type="button"
                          disabled={isSelf || deletingId === account.id}
                          title={isSelf ? "No puedes eliminar tu propia cuenta." : undefined}
                          onClick={() => {
                            setDeleteTarget(account);
                            setDeleteError(null);
                          }}
                          className="text-sm font-medium text-danger hover:text-danger/80 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Eliminar cuenta
                        </button>
                      )}
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

      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={closeResetDialog}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-line bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg font-bold text-ink">
              Restablecer contraseña de {resetTarget.full_name}
            </h2>

            <div className="mt-4 flex gap-4 text-sm text-ink">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="resetMode"
                  checked={resetMode === "auto"}
                  onChange={() => {
                    setResetMode("auto");
                    setResetCustomPassword("");
                  }}
                />
                Generar automáticamente
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="resetMode"
                  checked={resetMode === "custom"}
                  onChange={() => setResetMode("custom")}
                />
                Escribir manualmente
              </label>
            </div>

            {resetMode === "custom" && (
              <input
                type="text"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                value={resetCustomPassword}
                onChange={(e) => setResetCustomPassword(e.target.value)}
                className="mt-3 w-full rounded-md border border-line bg-card px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
              />
            )}

            {resetError && <p className="mt-3 text-sm text-danger">{resetError}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeResetDialog}
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink-soft hover:bg-paper"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resettingId === resetTarget.id}
                onClick={handleResetPassword}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
              >
                {resettingId === resetTarget.id ? "Restableciendo..." : "Restablecer"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={`¿Eliminar la cuenta de ${deleteTarget?.full_name ?? "esta persona"}?`}
        message="Esta acción no se puede deshacer: se elimina el acceso por completo, incluida la cuenta de inicio de sesión."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
