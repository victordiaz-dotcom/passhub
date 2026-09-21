-- PassHub v2, paso 3: RLS de `employees` escopeado por oficina.
-- Ver 0066 (catálogo offices + office_id) y 0042 (superadmin implica
-- admin en RLS). Confirmado con el usuario: si la cuenta que consulta
-- tiene office_id null, NO se restringe (sigue viendo todo, igual que
-- hoy) — el scoping por oficina solo aplica una vez que se le asigne
-- office_id a esa cuenta. Un employee sin office_id mapeado (dato
-- incompleto, ej. city que no matcheó en sync-employees) también se
-- sigue mostrando a todos, para no "perder" colaboradores por eso.
create function my_office_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select office_id from profiles where id = auth.uid()
$$;

-- Mismo criterio que has_role/las funciones de analytics: anon no debe
-- poder invocar funciones SECURITY DEFINER que leen `profiles`.
revoke execute on function public.my_office_id() from anon;

alter policy employees_select on employees
  using (
    has_role(auth.uid(), 'superadmin')
    or my_office_id() is null
    or office_id is null
    or office_id = my_office_id()
  );
