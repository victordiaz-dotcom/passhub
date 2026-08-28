-- has_role ahora exige perfil activo: al desactivar una cuenta, pierde de
-- inmediato todos los permisos basados en su rol vía RLS (no solo el acceso
-- desde la UI, que podía saltarse pegándole directo a la API).
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from user_roles ur
    join profiles p on p.id = ur.user_id
    where ur.user_id = _user_id and ur.role = _role and p.active = true
  )
$$;

-- Sin esto, cualquier usuario podía reactivarse a sí mismo o cambiarse de
-- empresa vía profiles_update_self; ahora esos dos campos solo los mueve un
-- admin (profiles_admin_all).
drop policy profiles_update_self on profiles;
create policy profiles_update_self on profiles for update to authenticated using (id = auth.uid())
with check (
  id = auth.uid()
  and active = (select active from profiles where id = auth.uid())
  and company_id is not distinct from (select company_id from profiles where id = auth.uid())
);
