-- Paridad de seguridad entre el repo y producción.
--
-- Hallazgo de la auditoría (2026-09-24): al reconstruir la base desde cero
-- con estos archivos (que es justo lo que se hizo para passhub-dev), varias
-- funciones SECURITY DEFINER quedan ejecutables por `anon`, mientras que en
-- producción NO lo están. Motivo: las migraciones viejas revocan
-- `from public`, pero Supabase otorga EXECUTE a `anon`/`authenticated` de
-- forma EXPLÍCITA, y un revoke a PUBLIC no quita un grant explícito. O sea:
-- reconstruir desde el repo producía una base MENOS segura que la real.
--
-- Verificado en las dos bases antes de escribir esto:
--   producción  -> log_audit/audit_visits/audit_user_roles/my_office_id: anon NO puede
--   passhub-dev -> las mismas cuatro: anon SÍ podía
--
-- La más grave era log_audit(): es SECURITY DEFINER e inserta directo en
-- audit_logs, así que quien pudiera invocarla por /rest/v1/rpc sin sesión
-- podía falsificar o inundar la bitácora de auditoría que revisa el super
-- admin (las filas salen con actor_id nulo, que la UI muestra como
-- "Sistema"). Las otras tres son de disparador o de apoyo a RLS.
--
-- Mismo patrón que ya usó la migración 0062 para has_role() -- la única de
-- las funciones viejas cuyo ACL sí quedó correcto, precisamente porque esa
-- sí revocó de `anon` explícitamente.
revoke execute on function public.log_audit(text, text, uuid, jsonb) from anon, authenticated;
revoke execute on function public.audit_visits() from anon, authenticated;
revoke execute on function public.audit_user_roles() from anon, authenticated;
revoke execute on function public.my_office_id() from anon;
