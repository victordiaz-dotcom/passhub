-- Corrige 0067: my_office_id() se creó con EXECUTE otorgado a PUBLIC por
-- defecto (comportamiento estándar de Postgres al crear una función), y
-- "revoke ... from anon" no lo anula porque un grant a PUBLIC aplica a
-- todos los roles sin importar revokes individuales. El advisor de
-- seguridad de Supabase lo confirmó: anon podía seguir invocando
-- my_office_id() vía /rest/v1/rpc/my_office_id. Mismo criterio que
-- has_role (ver 0062): se revoca de PUBLIC y se re-otorga solo a
-- authenticated, que es quien lo necesita para las políticas RLS.
revoke execute on function public.my_office_id() from public;
grant execute on function public.my_office_id() to authenticated;
