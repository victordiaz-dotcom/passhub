-- Tarea 2 de la sesión: se elimina el borrado de cuentas por completo (solo
-- suspender/reactivar) y se cierra un vacío de RLS: profiles_admin_update
-- dejaba que CUALQUIER admin cambiara "active" o "email" de cualquier
-- cuenta con un UPDATE directo a la tabla (sin pasar por la Edge Function
-- correspondiente), lo cual (a) permitía que un admin normal
-- (des)activara cuentas -- debe ser exclusivo de super_admin -- y (b)
-- podía desincronizar profiles.email de auth.users.email (la credencial
-- real de login), que solo se puede mantener sincronizada desde una Edge
-- Function con service role (set-account-active / update-user-email,
-- agregadas en esta misma tarea). Mismo patrón de comparar contra el valor
-- anterior vía subconsulta ya usado en profiles_update_self (migraciones
-- 0006/0032).

drop policy profiles_delete on profiles;

drop policy profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update to authenticated
using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
with check (
  (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
  and (
    active = (select p2.active from profiles p2 where p2.id = profiles.id)
    or has_role(auth.uid(), 'superadmin')
  )
  and email is not distinct from (select p2.email from profiles p2 where p2.id = profiles.id)
);
