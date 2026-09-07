-- has_role(_user_id, _role) era invocable directamente vía
-- /rest/v1/rpc/has_role por cualquier cuenta autenticada, con un _user_id
-- arbitrario (no necesariamente el propio) — permitía a cualquier cuenta
-- (incluso guardia) preguntar "¿esta otra persona es admin?" para cualquier
-- UUID que lograra obtener. Se restringe: solo se puede consultar el propio
-- rol, o el de otra persona si quien pregunta ya es admin.
--
-- Revisado: TODAS las políticas RLS existentes llaman has_role(auth.uid(),
-- rol) — nunca con el id de otra persona — así que este cambio no altera el
-- comportamiento de ninguna política ya existente, solo cierra el acceso
-- directo vía API para consultar el rol de un tercero sin ser admin.
create or replace function has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from user_roles ur
      join profiles p on p.id = ur.user_id
      where ur.user_id = _user_id and ur.role = _role and p.active = true
    )
    and (
      _user_id = auth.uid()
      or exists (
        select 1
        from user_roles ur
        join profiles p on p.id = ur.user_id
        where ur.user_id = auth.uid() and ur.role = 'admin' and p.active = true
      )
    )
$$;
