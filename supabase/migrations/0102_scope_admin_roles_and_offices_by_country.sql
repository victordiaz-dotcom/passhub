-- Superadmin conserva acceso global. Admin solo puede gestionar roles de
-- cuentas de su pais y oficinas de su pais. Una cuenta sin oficina no tiene
-- pais asignado y, por tanto, no recibe acceso administrativo geografico.

-- SECURITY DEFINER evita depender de la visibilidad RLS de profiles y
-- offices al comprobar la pertenencia de otra cuenta. Las funciones solo
-- devuelven el pais del propio admin o un booleano; no exponen perfiles.
create or replace function public.admin_country()
returns text
language sql stable security definer
set search_path = ''
as $$
  select o.country
  from public.profiles p
  join public.offices o on o.id = p.office_id
  where p.id = auth.uid()
    and p.active
    and exists (
      select 1 from public.user_roles r
      where r.user_id = p.id and r.role = 'admin'::public.app_role
    )
$$;

revoke all on function public.admin_country() from public;
grant execute on function public.admin_country() to authenticated;

create or replace function public.admin_user_in_country(target_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.offices o on o.id = p.office_id
    where p.id = target_user_id
      and o.country = public.admin_country()
  )
$$;

revoke all on function public.admin_user_in_country(uuid) from public;
grant execute on function public.admin_user_in_country(uuid) to authenticated;

create or replace function public.admin_can_edit_standard_roles(target_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.admin_user_in_country(target_user_id)
    and not exists (
      select 1 from public.user_roles r
      where r.user_id = target_user_id
        and r.role in ('admin'::public.app_role, 'superadmin'::public.app_role)
    )
$$;

revoke all on function public.admin_can_edit_standard_roles(uuid) from public;
grant execute on function public.admin_can_edit_standard_roles(uuid) to authenticated;

alter policy offices_write on public.offices
  using (
    public.has_role(auth.uid(), 'superadmin')
    or (public.has_role(auth.uid(), 'admin') and country = public.admin_country())
  )
  with check (
    public.has_role(auth.uid(), 'superadmin')
    or (public.has_role(auth.uid(), 'admin') and country = public.admin_country())
  );

alter policy user_roles_select on public.user_roles
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'superadmin')
    or public.admin_user_in_country(user_id)
  );

-- Mantener la prohibicion de borrar el propio rol elevado (migracion 0072).
alter policy user_roles_write on public.user_roles
  using (
    case
      when role in ('admin', 'superadmin') then
        public.has_role(auth.uid(), 'superadmin') and user_id <> auth.uid()
      else
        public.has_role(auth.uid(), 'superadmin')
        or public.admin_can_edit_standard_roles(user_id)
    end
  )
  with check (
    case
      when role in ('admin', 'superadmin') then
        public.has_role(auth.uid(), 'superadmin')
      else
        public.has_role(auth.uid(), 'superadmin')
        or public.admin_can_edit_standard_roles(user_id)
    end
  );

-- Cerrar la excepcion previa de admin sin oficina para crear/editar perfiles.
-- Se conserva la restriccion existente por oficina, mas estricta que pais.
alter policy profiles_admin_insert on public.profiles
  with check (
    public.has_role(auth.uid(), 'superadmin')
    or (public.has_role(auth.uid(), 'admin') and office_id = public.my_office_id())
  );

alter policy profiles_admin_update on public.profiles
  using (
    public.has_role(auth.uid(), 'superadmin')
    or (
      public.has_role(auth.uid(), 'admin')
      and office_id = public.my_office_id()
      and not exists (
        select 1 from public.user_roles ur
        where ur.user_id = profiles.id
          and ur.role in ('admin', 'superadmin')
      )
    )
  )
  with check (
    (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'superadmin'))
    and (
      active = (select p.active from public.profiles p where p.id = profiles.id)
      or public.has_role(auth.uid(), 'superadmin')
    )
    and email is not distinct from (select p.email from public.profiles p where p.id = profiles.id)
    and (
      public.has_role(auth.uid(), 'superadmin')
      or office_id is not distinct from public.my_office_id()
    )
  );
