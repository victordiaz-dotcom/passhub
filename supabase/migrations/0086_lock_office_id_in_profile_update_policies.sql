-- CRÍTICO, encontrado justo antes de dar acceso a testers externos: ni
-- profiles_update_self ni profiles_admin_update revisaban office_id en su
-- WITH CHECK -- se agregó la columna en la migración 0068 pero nunca se
-- protegió aquí, a diferencia de active/email/company_id que sí quedaron
-- bloqueados desde antes (migraciones 0006/0032/0048).
--
-- Exploit real, verificado en vivo con una cuenta desechable: cualquier
-- cuenta autenticada (incluida recepción o guardia, no solo admin) podía
-- hacer
--   PATCH /rest/v1/profiles?id=eq.<su propio id>  { "office_id": null }
-- y pasaba profiles_update_self sin problema (id coincide, active/email/
-- company_id sin tocar). Con office_id en null, my_office_id() devuelve
-- null, y employees_select/prereg_select/prereg_update (migraciones
-- 0069/0083) tratan eso como "sin restricción, ve todo" -- así que
-- cualquiera se auto-otorgaba visibilidad de TODOS los países con una sola
-- llamada, saltándose por completo el aislamiento que se acaba de
-- verificar en vivo (empleados y pre-registros filtrados por país).
--
-- NOTA IMPORTANTE: esta misma columna/patrón ya existe en PRODUCCIÓN desde
-- el merge de office scoping (semanas atrás) -- este mismo hueco muy
-- probablemente también está abierto ahí ahora mismo, independiente de si
-- v2 ya se considera "lista". Aplicar esta migración a producción por
-- separado, no depende de terminar las pruebas de v2.
--
-- profiles_update_self: ahora office_id debe quedar exactamente igual
-- (ninguna cuenta puede cambiar su propia oficina por sí misma, ni
-- siquiera un admin -- reasignar oficina queda exclusivo del flujo de
-- Cuentas, que pasa por profiles_admin_update).
drop policy profiles_update_self on profiles;
create policy profiles_update_self on profiles for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and active = (select active from profiles where id = auth.uid())
  and email is not distinct from (select email from profiles where id = auth.uid())
  and company_id is not distinct from (select company_id from profiles where id = auth.uid())
  and office_id is not distinct from (select office_id from profiles where id = auth.uid())
);

-- profiles_admin_update: mismo criterio que ya aplica create-user del lado
-- del servidor (migración de office scoping) -- un admin sin oficina
-- asignada (unrestricted) puede asignar cualquier oficina a cualquier
-- cuenta; un admin CON oficina asignada solo puede dejar la oficina de la
-- cuenta que edita IGUAL A LA SUYA PROPIA (nunca a otra oficina, nunca a
-- null); superadmin sin restricción, como ya era para active/email.
--
-- Verificado en vivo con cuentas desechables: (a) un admin de Monterrey
-- editando a un recepcionista de Monterrey y dejándolo en Monterrey ->
-- HTTP 200, funciona igual que antes; (b) el mismo admin intentando mover
-- a ese recepcionista a Madrid -> HTTP 403, bloqueado.
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
  and (
    has_role(auth.uid(), 'superadmin')
    or (select p3.office_id from profiles p3 where p3.id = auth.uid()) is null
    or office_id is not distinct from (select p3.office_id from profiles p3 where p3.id = auth.uid())
  )
);
