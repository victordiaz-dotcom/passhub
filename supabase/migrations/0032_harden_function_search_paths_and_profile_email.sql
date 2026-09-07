-- Hardening señalado por el advisor de seguridad de Supabase:
-- 1) Varias funciones no fijaban search_path, lo que en teoría permite
--    hijacking de resolución de nombres si alguien pudiera crear objetos en
--    un esquema anterior en el search_path de la sesión. Se fija a 'public'
--    en todas, igual que ya se hacía en has_role/log_audit/etc.
-- 2) profiles_update_self ya evitaba que alguien se auto-cambiara active o
--    company_id, pero no email — cualquier cuenta podía reescribir su propio
--    correo registrado sin pasar por un admin (la restricción de la UI en
--    Users.tsx era solo cosmética). Se agrega email a la misma protección.

alter function lock_visit_immutable_fields() set search_path = public;
alter function restrict_prereg_extension_to_admin() set search_path = public;
alter function analytics_visits_by_month(timestamptz, timestamptz) set search_path = public;
alter function analytics_top_visitor_companies(timestamptz, timestamptz, int) set search_path = public;
alter function analytics_top_hosts(timestamptz, timestamptz, int) set search_path = public;
alter function analytics_prereg_status_breakdown(timestamptz, timestamptz) set search_path = public;
alter function analytics_visits_by_hour(timestamptz, timestamptz) set search_path = public;
alter function analytics_visits_by_weekday(timestamptz, timestamptz) set search_path = public;

drop policy profiles_update_self on profiles;
create policy profiles_update_self on profiles for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and active = (select active from profiles where id = auth.uid())
  and email is not distinct from (select email from profiles where id = auth.uid())
  and company_id is not distinct from (select company_id from profiles where id = auth.uid())
);
