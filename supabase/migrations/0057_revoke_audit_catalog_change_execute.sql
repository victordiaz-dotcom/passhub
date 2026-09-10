-- audit_catalog_change() (migración 0052) es SECURITY DEFINER y solo debe
-- dispararse como trigger, nunca llamarse directo por RPC. A diferencia de
-- audit_visits()/audit_user_roles() (bloqueadas desde el principio, ver
-- migración 0005), esta se creó sin revocar EXECUTE -- el advisor de
-- seguridad de Supabase la marcó como invocable por anon/authenticated vía
-- /rest/v1/rpc/audit_catalog_change. Revocar el EXECUTE no afecta a los
-- triggers (disparan con los privilegios del dueño de la función, no con
-- el grant del rol que hizo el INSERT/UPDATE/DELETE).
revoke execute on function public.audit_catalog_change() from public, anon, authenticated;
