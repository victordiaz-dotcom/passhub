import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MoreVertical, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/roles";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TableSkeletonRows } from "@/components/Skeleton";
import { PageHeader, PageShell } from "@/components/layout/PageShell";
import { CountryFlag } from "@/components/CountryFlag";
import { copyToClipboard } from "@/lib/clipboard";
import { COUNTRY_LABELS, COUNTRY_ORDER } from "@/lib/countryFlags";
import { clearViewCache, coalesceViewRequest, readViewCache, writeViewCache } from "@/lib/viewCache";
import { isValidName, NAME_INVALID_MESSAGE } from "@/lib/nameValidation";
import {
  filterNameInput,
  filterEmailInput,
  filterUsernameInput,
  isValidEmailFormat,
  EMAIL_INVALID_MESSAGE,
  USERNAME_INVALID_MESSAGE,
} from "@/lib/inputFilters";
import type { Tables } from "@/integrations/supabase/types";

// Debe ser la MISMA lista que ALLOWED_EMAIL_DOMAINS en
// supabase/functions/create-user/index.ts -- esto es solo un aviso rápido en
// el formulario; la función de borde es la que de verdad lo exige del lado
// del servidor.
const ALLOWED_EMAIL_DOMAINS = ["tendencys.com", "ecartpay.com", "parapaquetes.com", "envia.com"];

function emailDomainAllowed(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at === -1) return false;
  return ALLOWED_EMAIL_DOMAINS.includes(trimmed.slice(at + 1));
}

const USERNAME_RE = /^[a-z0-9._-]+$/;
function isValidUsername(value: string): boolean {
  return USERNAME_RE.test(value);
}

type Account = Tables<"profiles"> & {
  companies: Pick<Tables<"companies">, "name"> | null;
  offices: Pick<Tables<"offices">, "name" | "country"> | null;
  user_roles: Pick<Tables<"user_roles">, "role">[];
};
type Company = Pick<Tables<"companies">, "id" | "name">;
type Office = Pick<Tables<"offices">, "id" | "name" | "country">;

const emptyForm = {
  email: "",
  username: "",
  fullName: "",
  companyId: "",
  country: "",
  officeId: "",
  role: "recepcion",
  passwordMode: "auto" as "auto" | "custom",
  customPassword: "",
  requireChange: true,
};


export default function Users() {
  const { session, profile, isSuperadmin } = useAuth();
  // Mismo criterio que las políticas RLS de employees (migración 0069):
  // office_id null en el propio perfil = sin restricción. Un admin con
  // oficina asignada solo puede crear/editar cuentas de esa misma oficina
  // (lo valida también create-user del lado del servidor).
  const callerOfficeId = profile?.office_id ?? null;
  const officeLocked = !isSuperadmin && !!callerOfficeId;

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedFilterKey, setLoadedFilterKey] = useState<string | null>(null);
  const loadRequestId = useRef(0);
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
  const [resetRequireChange, setResetRequireChange] = useState(true);
  const [resetError, setResetError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);

  const [editingOriginalEmail, setEditingOriginalEmail] = useState("");
  const [editingOriginalRoles, setEditingOriginalRoles] = useState<string[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Account | null>(null);
  // Crear y editar se abren como ventanas encima de la lista.
  const [showCreateForm, setShowCreateForm] = useState(false);
  // Errores de campo mostrados EN VIVO (al salir del campo, no solo hasta
  // darle a "Crear cuenta") -- se marca "tocado" al perder el foco y desde
  // ahí el mensaje se recalcula en cada tecla, así que se ve y se quita
  // solo, sin esperar al envío del formulario.
  const [touched, setTouched] = useState({ fullName: false, email: false, username: false });
  function touch(field: keyof typeof touched) {
    setTouched((t) => ({ ...t, [field]: true }));
  }
  const fullNameError = touched.fullName && form.fullName && !isValidName(form.fullName) ? NAME_INVALID_MESSAGE : null;
  const emailError = touched.email && form.email && !isValidEmailFormat(form.email) ? EMAIL_INVALID_MESSAGE : null;
  const usernameError =
    touched.username && form.username && !isValidUsername(form.username) ? USERNAME_INVALID_MESSAGE : null;

  // Filtro de región y país para la lista de cuentas -- solo tiene sentido para
  // superadmin: un admin ya solo ve (por RLS) las cuentas de su propia
  // oficina, así que nunca tendría nada que filtrar.
  const [accountCountryFilter, setAccountCountryFilter] = useState("");
  const [accountSearchInput, setAccountSearchInput] = useState("");
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const filterKey = accountCountryFilter;
  const cacheKey = `users:${session?.user?.id ?? ""}:${isSuperadmin}:${callerOfficeId ?? ""}:${filterKey}`;
  const showingSkeleton = loading || loadedFilterKey !== filterKey;
  const normalizedSearch = accountSearchQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visibleAccounts = normalizedSearch
    ? accounts.filter((account) =>
        [account.full_name, account.username, account.email].some((value) =>
          value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalizedSearch)
        )
      )
    : accounts;

  // Menú de acciones por fila (Editar / Restablecer / Activar-Desactivar) --
  // antes eran 3 botones de texto apilados, que obligaban a la tabla a
  // desbordarse horizontalmente (scroll) para caber junto con las demás
  // columnas. Un solo ícono que abre un menú angosto evita ese scroll sin
  // quitar ninguna acción.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const isEditing = editingId !== null;

  async function loadAccounts(quiet = false) {
    const requestId = ++loadRequestId.current;
    const requestedFilterKey = filterKey;
    if (!quiet) setLoading(true);
    const officeRelation = accountCountryFilter ? "offices!inner(name, country)" : "offices(name, country)";
    let query = supabase
      .from("profiles")
      .select(`*, companies(name), ${officeRelation}, user_roles(role)`)
      .order("full_name");
    if (isSuperadmin && accountCountryFilter) {
      query = query.eq("offices.country", accountCountryFilter);
    }
    const { data, error } = await coalesceViewRequest(cacheKey, async () => await query);
    if (requestId !== loadRequestId.current) return;
    if (!error) {
      const rows = (data as Account[] | null) ?? [];
      setAccounts(rows);
      writeViewCache(cacheKey, rows);
    }
    setLoadedFilterKey(requestedFilterKey);
    setLoading(false);
  }

  useLayoutEffect(() => {
    const cached = readViewCache<Account[]>(cacheKey);
    if (cached) {
      loadRequestId.current += 1;
      setAccounts(cached.value);
      setLoadedFilterKey(filterKey);
      setLoading(false);
      if (cached.fresh) return;
    }
    void loadAccounts(Boolean(cached));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountCountryFilter, session?.user?.id, isSuperadmin, callerOfficeId]);

  useEffect(() => {
    const companyKey = `users:companies:${session?.user?.id ?? ""}`;
    const officeKey = `users:offices:${session?.user?.id ?? ""}`;
    const companiesCached = readViewCache<Company[]>(companyKey);
    const officesCached = readViewCache<Office[]>(officeKey);
    if (companiesCached) setCompanies(companiesCached.value);
    if (officesCached) setOffices(officesCached.value);
    if (!companiesCached?.fresh) {
      void coalesceViewRequest(companyKey, async () => await supabase.from("companies").select("id, name").order("name"))
        .then(({ data, error }) => {
          if (!error) {
            const rows = data ?? [];
            setCompanies(rows);
            writeViewCache(companyKey, rows);
          }
        });
    }
    if (!officesCached?.fresh) {
      void coalesceViewRequest(officeKey, async () => await supabase.from("offices").select("id, name, country").order("name"))
        .then(({ data, error }) => {
          if (!error) {
            const rows = data ?? [];
            setOffices(rows);
            writeViewCache(officeKey, rows);
          }
        });
    }
  }, [session?.user?.id]);

  // Si el admin que crea/edita tiene oficina asignada, se precarga y se
  // deja fijo el país/oficina en el formulario (los selectores quedan
  // deshabilitados más abajo) -- así nunca queda en blanco esperando que
  // los elija de una lista que de todos modos solo tiene una opción
  // visible para él.
  useEffect(() => {
    if (officeLocked && callerOfficeId && !form.officeId) {
      const callerOffice = offices.find((o) => o.id === callerOfficeId);
      setForm((f) => ({ ...f, officeId: callerOfficeId, country: callerOffice?.country ?? f.country }));
    }
  }, [officeLocked, callerOfficeId, offices, form.officeId]);

  // País → oficina: basado en cuántas oficinas tiene ese país, no en un
  // país fijo -- si tiene más de una (ej. México con varias ciudades),
  // elegir el país no resuelve la oficina todavía (se limpia y se pide
  // elegir aparte); si solo tiene una, elegir el país ya la resuelve sin
  // un paso extra.
  function handleCountryChange(country: string) {
    const countryOffices = offices.filter((o) => o.country === country);
    if (countryOffices.length > 1) {
      setForm({ ...form, country, officeId: "" });
      return;
    }
    setForm({ ...form, country, officeId: countryOffices[0]?.id ?? "" });
  }

  function startEdit(account: Account) {
    setError(null);
    setEditingId(account.id);
    setEditingOriginalEmail(account.email);
    setEditingOriginalRoles(account.user_roles.map((r) => r.role));
    const accountOffice = offices.find((o) => o.id === account.office_id);
    setForm({
      email: account.email,
      username: account.username,
      fullName: account.full_name,
      companyId: account.company_id ?? "",
      country: accountOffice?.country ?? "",
      officeId: account.office_id ?? "",
      role: account.user_roles[0]?.role ?? "recepcion",
      passwordMode: "auto",
      customPassword: "",
      requireChange: true,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setShowCreateForm(false);
    setTouched({ fullName: false, email: false, username: false });
  }

  function closeCreateForm() {
    if (saving) return;
    setShowCreateForm(false);
    setForm(emptyForm);
    setError(null);
    setTouched({ fullName: false, email: false, username: false });
  }

  async function handleCreate() {
    // superadmin ve todo por rol, no por oficina -- nunca lleva office_id.
    const officeId = form.role === "superadmin" ? null : form.officeId || null;
    const { data, error: invokeError } = await supabase.functions.invoke("create-user", {
      body: {
        email: form.email,
        username: filterUsernameInput(form.email.split("@")[0] ?? ""),
        fullName: form.fullName,
        companyId: form.companyId,
        officeId,
        role: form.role,
        password: form.passwordMode === "custom" ? form.customPassword : undefined,
        requireChange: form.requireChange,
      },
    });

    if (invokeError || data?.error) {
      setError(data?.error ?? (await edgeFunctionErrorMessage(invokeError, "No se pudo crear la cuenta. Intenta de nuevo.")));
      return false;
    }

    setCopied(null);
    setTempPasswordInfo({ email: data.email, tempPassword: data.tempPassword, context: "creada" });
    return true;
  }

  async function handleUpdate() {
    if (!editingId) return false;

    if (form.email !== editingOriginalEmail) {
      const { data, error: invokeError } = await supabase.functions.invoke("update-user-email", {
        body: { userId: editingId, email: form.email },
      });

      if (invokeError || data?.error) {
        setError(data?.error ?? (await edgeFunctionErrorMessage(invokeError, "No se pudo actualizar el correo.")));
        return false;
      }
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: form.fullName,
        company_id: form.companyId,
        office_id: form.role === "superadmin" ? null : form.officeId || null,
        username: form.username,
      })
      .eq("id", editingId);

    if (profileError) {
      setError(
        profileError.message.includes("profiles_username_lower_idx")
          ? "Ese usuario ya está en uso por otra cuenta."
          : "No se pudo actualizar el colaborador."
      );
      return false;
    }

    // Bug reportado en producción: si la cuenta que edita se está editando a
    // sí misma (ej. super admin cambiando su propio nombre) y antes se
    // borraba el rol viejo primero, la policy de user_roles para roles
    // admin/superadmin (migración 0016) exige has_role(auth.uid(),
    // 'superadmin') en el momento de CADA operación -- al borrar su propio
    // rol de superadmin primero, esa autorización desaparecía antes de
    // poder insertar el rol nuevo. Si el INSERT fallaba por lo que fuera
    // (incluida esa misma RLS), la cuenta se quedaba sin ningún rol y sin
    // forma de arreglarlo ella misma. Por eso ahora: no se toca user_roles
    // si el rol no cambió, y si cambió, se inserta el nuevo ANTES de borrar
    // el viejo (nunca al revés).
    const roleUnchanged = editingOriginalRoles.length === 1 && editingOriginalRoles[0] === form.role;

    if (!roleUnchanged) {
      if (!editingOriginalRoles.includes(form.role)) {
        const { error: insertRoleError } = await supabase
          .from("user_roles")
          .insert({ user_id: editingId, role: form.role as "admin" | "recepcion" | "superadmin" | "guardia" });

        if (insertRoleError) {
          setError("No se pudo actualizar el rol.");
          return false;
        }
      }

      const rolesToRemove = editingOriginalRoles.filter((r) => r !== form.role);
      if (rolesToRemove.length > 0) {
        const { error: deleteRoleError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", editingId)
          .in("role", rolesToRemove as ("admin" | "recepcion" | "superadmin" | "guardia")[]);

        if (deleteRoleError) {
          setError("No se pudo actualizar el rol.");
          return false;
        }
      }
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidName(form.fullName)) {
      setError(NAME_INVALID_MESSAGE);
      return;
    }

    if (!isValidEmailFormat(form.email)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }

    if (!isValidUsername(form.username)) {
      setError(USERNAME_INVALID_MESSAGE);
      return;
    }

    // El dominio permitido solo se exige al CREAR una cuenta nueva -- no al
    // editar una ya existente, para no bloquear la edición de cuentas que ya
    // están dadas de alta con otro correo (y no forzar a cambiarlo solo para
    // poder guardar un cambio de nombre/empresa/rol que no toca el correo).
    if (!isEditing && !emailDomainAllowed(form.email)) {
      setError(
        `Solo se permiten correos de: ${ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(", ")}.`
      );
      return;
    }

    if (!form.companyId) {
      setError("Selecciona una empresa.");
      return;
    }

    // superadmin ve todo por rol, así que no le aplica -- recepción, admin
    // y guardia siempre deben quedar en una oficina concreta.
    if (form.role !== "superadmin" && !form.officeId) {
      setError("Selecciona una oficina.");
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
    setShowCreateForm(false);
    setTouched({ fullName: false, email: false, username: false });
    clearViewCache("users:");
    void loadAccounts(true);
  }

  function openResetDialog(account: Account) {
    setResetTarget(account);
    setResetMode("auto");
    setResetCustomPassword("");
    setResetRequireChange(true);
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
        requireChange: resetRequireChange,
      },
    });

    setResettingId(null);

    if (invokeError || data?.error) {
      setResetError(data?.error ?? (await edgeFunctionErrorMessage(invokeError, "No se pudo restablecer la contraseña.")));
      return;
    }

    setResetTarget(null);
    setCopied(null);
    setTempPasswordInfo({ email: data.email, tempPassword: data.tempPassword, context: "restablecida" });
  }

  function handleToggleClick(account: Account) {
    // Desactivar sí se confirma (bloquea el acceso de inmediato); reactivar
    // no necesita confirmación, es una acción reversible y de bajo riesgo.
    if (account.active) {
      setDeactivateTarget(account);
      return;
    }
    toggleActive(account);
  }

  async function toggleActive(account: Account) {
    setTogglingId(account.id);

    const { data, error: invokeError } = await supabase.functions.invoke("set-account-active", {
      body: { userId: account.id, active: !account.active },
    });

    setTogglingId(null);

    if (invokeError || data?.error) {
      setError(data?.error ?? (await edgeFunctionErrorMessage(invokeError, "No se pudo actualizar el estado de la cuenta.")));
      return;
    }

    clearViewCache("users:");
    void loadAccounts(true);
  }

  // Campos compartidos entre las ventanas de crear y editar -- un solo lugar para no
  // mantener dos copias del formulario.
  const formFields = (
    <>
      <div>
        <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-ink-soft">
          Nombre completo
        </label>
        <input
          id="fullName"
          type="text"
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: filterNameInput(e.target.value) })}
          onBlur={() => touch("fullName")}
          className="input-field h-auto py-2"
        />
        {fullNameError && <p className="mt-1 text-xs text-danger">{fullNameError}</p>}
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-ink-soft">
          Correo
        </label>
        <input
          id="email"
          type="email"
          required
          value={form.email}
          onChange={(e) => {
            const email = filterEmailInput(e.target.value);
            setForm((current) => ({
              ...current,
              email,
              username: isEditing ? current.username : filterUsernameInput(email.split("@")[0] ?? ""),
            }));
          }}
          onBlur={() => touch("email")}
          className="input-field h-auto py-2"
        />
        {emailError && <p className="mt-1 text-xs text-danger">{emailError}</p>}
        {isEditing && form.email !== editingOriginalEmail && (
          <p className="mt-1 text-xs text-ink-soft">
            Se actualizará el correo de acceso de esta cuenta al guardar.
          </p>
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
          onChange={isEditing ? (e) => setForm({ ...form, username: filterUsernameInput(e.target.value) }) : undefined}
          readOnly={!isEditing}
          onBlur={() => touch("username")}
          className="input-field h-auto py-2 read-only:bg-page read-only:text-ink-soft"
        />
        {usernameError && <p className="mt-1 text-xs text-danger">{usernameError}</p>}
        <p className="mt-1 text-xs text-ink-soft">{isEditing ? "Con esto (o el correo) inicia sesión." : "Se genera automáticamente a partir del correo."}</p>
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
          className="input-field h-auto py-2"
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
          className="input-field h-auto py-2"
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

      {form.role !== "superadmin" && (
        <div>
          <label htmlFor="country" className="mb-1 block text-sm font-medium text-ink-soft">
            País
          </label>
          <div className="flex items-center gap-2">
          <CountryFlag code={form.country} />
          <select
            id="country"
            required
            value={form.country}
            disabled={officeLocked}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="input-field h-auto py-2 disabled:opacity-60"
          >
            <option value="" disabled>
              Selecciona un país
            </option>
            {COUNTRY_ORDER.filter((code) => offices.some((o) => o.country === code)).map((code) => (
              <option key={code} value={code}>
                {COUNTRY_LABELS[code] ?? code}
              </option>
            ))}
          </select>
          </div>
          {officeLocked && (
            <p className="mt-1 text-xs text-ink-soft">Solo puedes crear/editar cuentas de tu propia oficina.</p>
          )}
        </div>
      )}

      {form.role !== "superadmin" && offices.filter((o) => o.country === form.country).length > 1 && (
        <div>
          <label htmlFor="office" className="mb-1 block text-sm font-medium text-ink-soft">
            Oficina
          </label>
          <select
            id="office"
            required
            value={form.officeId}
            disabled={officeLocked}
            onChange={(e) => setForm({ ...form, officeId: e.target.value })}
            className="input-field h-auto py-2 disabled:opacity-60"
          >
            <option value="" disabled>
              Selecciona una oficina
            </option>
            {offices
              .filter((o) => o.country === form.country)
              .map((office) => (
                <option key={office.id} value={office.id}>
                  {office.name}
                </option>
              ))}
          </select>
        </div>
      )}

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
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="Mínimo 8 caracteres"
              value={form.customPassword}
              onChange={(e) => setForm({ ...form, customPassword: e.target.value })}
              className="input-field mt-2 h-auto py-2"
            />
          )}
          <label className="mt-3 flex items-center gap-1.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.requireChange}
              onChange={(e) => setForm({ ...form, requireChange: e.target.checked })}
            />
            Pedirle que la cambie al iniciar sesión por primera vez
          </label>
        </div>
      )}

      <div className="flex items-end gap-2 sm:col-span-2">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear cuenta"}
        </button>
        {isEditing && (
          <button type="button" onClick={cancelEdit} className="btn-secondary">
            Cancelar
          </button>
        )}
        {!isEditing && (
          <button
            type="button"
            onClick={closeCreateForm}
            className="btn-secondary"
          >
            Cancelar
          </button>
        )}
      </div>

      {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
    </>
  );

  return (
    <PageShell width="medium">
      <PageHeader title="Cuentas" description="Administra usuarios, roles y acceso por oficina." />

      {tempPasswordInfo && (
        // Mismo patrón de ventana que "Editar cuenta" / "Restablecer
        // contraseña" (overlay + tarjeta centrada) -- antes esto era un
        // aviso pegado arriba de la página, fácil de perder de vista sobre
        // todo si ya se había cerrado el modal de restablecer.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setTempPasswordInfo(null)}
        >
          <div className="modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold text-ink">
              Contraseña {tempPasswordInfo.context}
            </h2>
            <p className="mt-3 text-sm text-ink-soft">
              Para <span className="font-medium text-ink">{tempPasswordInfo.email}</span>
            </p>

            <div className="mt-6 rounded-xl border border-line bg-surface-soft p-5">
              <p className="text-sm text-ink-soft">Contraseña temporal (solo se muestra una vez):</p>
              <div className="mt-3 flex items-center gap-3">
                <p className="font-display text-2xl font-bold tracking-wide text-ink">
                  {tempPasswordInfo.tempPassword}
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyToClipboard(tempPasswordInfo.tempPassword);
                    setCopied(ok);
                  }}
                  className="btn-secondary h-auto px-2 py-1 text-xs"
                >
                  {copied === true ? "¡Copiada!" : copied === false ? "No se pudo, selecciónala" : "Copiar"}
                </button>
              </div>
            </div>

            <p className="mt-4 text-xs text-ink-soft">
              Cópiala y entrégasela en persona o por un canal seguro.
            </p>

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => setTempPasswordInfo(null)}
                className="btn-primary"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditing && (
        // Editar cuenta como ventana aislada encima del resto (no un layout
        // nuevo/otra pestaña): mismo overlay + tarjeta blanca que ya usa
        // ConfirmDialog, con los colores/estilo de siempre.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-6"
          onClick={cancelEdit}
        >
          <div className="modal my-8 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 font-display text-base font-bold text-ink">Editar cuenta</h2>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              {formFields}
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setForm(emptyForm);
          setError(null);
          setTouched({ fullName: false, email: false, username: false });
          setShowCreateForm(true);
        }}
        className="btn-primary mb-6"
      >
        + Crear cuenta
      </button>

      {showCreateForm && !isEditing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-6"
          onClick={closeCreateForm}
        >
          <div className="modal my-8 w-full max-w-2xl" role="dialog" aria-modal="true" aria-labelledby="createAccountTitle" onClick={(event) => event.stopPropagation()}>
            <h2 id="createAccountTitle" className="mb-4 font-display text-base font-bold text-ink">Crear cuenta</h2>
            <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
              {formFields}
            </form>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-bold text-ink">Cuentas registradas</h2>
        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={(event) => { event.preventDefault(); setAccountSearchQuery(accountSearchInput); }} className="flex items-end gap-2">
            <div>
              <label htmlFor="accountSearch" className="mb-1 block text-xs font-medium text-ink-soft">Buscar colaborador</label>
              <input
                id="accountSearch"
                type="search"
                value={accountSearchInput}
                onChange={(event) => {
                  setAccountSearchInput(event.target.value);
                  if (!event.target.value) setAccountSearchQuery("");
                }}
                placeholder="Nombre, usuario o correo"
                className="input-field h-10 w-56 py-2"
              />
            </div>
            <button type="submit" className="btn-secondary inline-flex h-10 items-center gap-2" aria-label="Buscar colaborador">
              <Search size={16} aria-hidden="true" /> Buscar
            </button>
          </form>
        {isSuperadmin && (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="accountCountryFilter" className="mb-1 block text-xs font-medium text-ink-soft">
                País
              </label>
              <div className="relative">
                {accountCountryFilter && <CountryFlag code={accountCountryFilter} className="absolute left-3 top-1/2 h-4 w-6 -translate-y-1/2" />}
                <select
                  id="accountCountryFilter"
                  value={accountCountryFilter}
                  onChange={(event) => setAccountCountryFilter(event.target.value)}
                  className={`input-field h-auto min-w-36 py-2 ${accountCountryFilter ? "pl-11" : ""}`}
                >
                  <option value="">Todos</option>
                  <option value="MX">México</option>
                  <option value="ES">España</option>
                </select>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      <div className="card min-h-80 overflow-x-auto p-0">
        {/* table-fixed + un ancho por columna (en vez de que cada columna
            crezca a lo que pida su contenido, como con el table-auto de
            antes) -- así un correo o nombre largo se trunca (con "..." y
            title= para ver el texto completo al pasar el mouse) en vez de
            estirar la tabla más allá del ancho de la tarjeta, que era lo
            que obligaba al scroll horizontal aun en pantallas anchas. */}
        <table className="w-full table-fixed text-left text-sm">
          <thead>
            <tr className="tbl-head border-b border-line text-ink-soft">
              <th className="w-[16%] px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Nombre</th>
              <th className="w-[12%] px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Usuario</th>
              <th className="w-[22%] px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Correo</th>
              <th className="w-[16%] px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Empresa</th>
              <th className="w-[12%] px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Oficina</th>
              <th className="w-[9%] px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Rol</th>
              <th className="w-[9%] px-4 py-3 text-[10px] font-bold uppercase tracking-widest">Estado</th>
              <th className="w-[4%] px-2 py-3 text-[10px] font-bold uppercase tracking-widest">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {showingSkeleton && <TableSkeletonRows rows={Math.max(5, Math.min(accounts.length, 10))} columns={8} />}
            {!showingSkeleton && visibleAccounts.length === 0 && (
              <tr>
                <td colSpan={8} className="h-64 px-4 py-6 text-center align-middle text-ink-soft">
                  {normalizedSearch || accountCountryFilter
                    ? "No hay cuentas que coincidan con estos filtros."
                    : "No hay cuentas registradas."}
                </td>
              </tr>
            )}
            {!showingSkeleton && visibleAccounts.map((account) => {
              const isSelf = account.id === session?.user.id;
              const accountIsElevated = account.user_roles.some(
                (r) => r.role === "admin" || r.role === "superadmin"
              );
              const canEditAccount = isSuperadmin || !accountIsElevated;
              const officeLabel = account.offices?.name ?? "—";
              const roleLabel = account.user_roles.map((r) => ROLE_LABELS[r.role] ?? r.role).join(", ") || "—";
              return (
                <tr key={account.id} className="border-b border-line last:border-0">
                  <td className="truncate px-4 py-3 text-ink" title={account.full_name}>
                    {account.full_name}
                  </td>
                  <td className="truncate px-4 py-3 text-ink-soft" title={account.username}>
                    {account.username}
                  </td>
                  <td className="truncate px-4 py-3 text-ink-soft" title={account.email}>
                    {account.email}
                  </td>
                  <td className="truncate px-4 py-3 text-ink-soft" title={account.companies?.name ?? "—"}>
                    {account.companies?.name ?? "—"}
                  </td>
                  <td className="truncate px-4 py-3 text-ink-soft" title={officeLabel}>
                    {account.offices && <CountryFlag code={account.offices.country} className="mr-1 h-3 w-[18px]" />}
                    {officeLabel}
                  </td>
                  <td className="truncate px-4 py-3 text-ink-soft" title={roleLabel}>
                    {roleLabel}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        account.active ? "bg-accent-tint text-accent-dark" : "bg-line text-ink-soft"
                      }`}
                    >
                      {account.active ? "Activo" : "Suspendido"}
                    </span>
                  </td>
                  <td className="relative px-2 py-3">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === account.id ? null : account.id)}
                      aria-label="Acciones"
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === account.id}
                      className="rounded-md p-1.5 text-ink-soft hover:bg-line hover:text-ink"
                    >
                      <MoreVertical size={18} />
                    </button>
                    {openMenuId === account.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <div
                          role="menu"
                          className="dropdown-popover absolute right-4 top-full z-20 mt-1 w-56 p-1.5"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            disabled={!canEditAccount}
                            title={
                              canEditAccount
                                ? undefined
                                : "Solo un super admin puede editar cuentas de admin/super admin."
                            }
                            onClick={() => {
                              setOpenMenuId(null);
                              startEdit(account);
                            }}
                            className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-ink hover:bg-line disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Editar
                          </button>
                          {canEditAccount && (
                            <button
                              type="button"
                              role="menuitem"
                              disabled={resettingId === account.id}
                              onClick={() => {
                                setOpenMenuId(null);
                                openResetDialog(account);
                              }}
                              className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-ink hover:bg-line disabled:opacity-50"
                            >
                              {resettingId === account.id ? "Restableciendo..." : "Restablecer contraseña"}
                            </button>
                          )}
                          {isSuperadmin && (
                            <button
                              type="button"
                              role="menuitem"
                              disabled={isSelf || togglingId === account.id}
                              title={
                                isSelf
                                  ? "No puedes desactivar tu propia cuenta."
                                  : account.active
                                    ? "Bloquea el acceso de la persona. No borra su cuenta ni su historial."
                                    : "Restaura su acceso."
                              }
                              onClick={() => {
                                setOpenMenuId(null);
                                handleToggleClick(account);
                              }}
                              className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-ink hover:bg-line disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {togglingId === account.id
                                ? "Actualizando..."
                                : account.active
                                  ? "Desactivar"
                                  : "Activar"}
                            </button>
                          )}
                        </div>
                      </>
                    )}
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
          <div className="modal max-w-sm" onClick={(e) => e.stopPropagation()}>
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
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
                value={resetCustomPassword}
                onChange={(e) => setResetCustomPassword(e.target.value)}
                className="input-field mt-3 h-auto py-2"
              />
            )}

            <label className="mt-3 flex items-center gap-1.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={resetRequireChange}
                onChange={(e) => setResetRequireChange(e.target.checked)}
              />
              Pedirle que la cambie al iniciar sesión
            </label>

            {resetError && <p className="mt-3 text-sm text-danger">{resetError}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={closeResetDialog} className="btn-secondary">
                Cancelar
              </button>
              <button
                type="button"
                disabled={resettingId === resetTarget.id}
                onClick={handleResetPassword}
                className="btn-primary"
              >
                {resettingId === resetTarget.id ? "Restableciendo..." : "Restablecer"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deactivateTarget}
        title="Desactivar cuenta"
        message={
          deactivateTarget
            ? `¿Desactivar a ${deactivateTarget.full_name}? Perderá acceso de inmediato. Su historial de visitas y auditoría no se borra, y puedes reactivarla cuando quieras.`
            : undefined
        }
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        variant="danger"
        onConfirm={() => {
          if (deactivateTarget) toggleActive(deactivateTarget);
          setDeactivateTarget(null);
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </PageShell>
  );
}
