-- Las funciones de analíticas creadas en 0029 quedaron con el grant EXECUTE
-- por defecto para PUBLIC (incluye anon), igual que cualquier función nueva.
-- Se restringen al mismo patrón ya usado para has_role() y otras funciones
-- sensibles: solo authenticated/service_role pueden invocarlas. El chequeo
-- interno de has_role(auth.uid(),'admin') ya las protegía en la práctica
-- (anon no tiene EXECUTE sobre has_role, así que la llamada fallaría de
-- todos modos), pero esto lo deja explícito en vez de depender de un efecto
-- transitivo.
revoke execute on function analytics_visits_by_month(timestamptz, timestamptz) from public;
revoke execute on function analytics_top_visitor_companies(timestamptz, timestamptz, int) from public;
revoke execute on function analytics_top_hosts(timestamptz, timestamptz, int) from public;
revoke execute on function analytics_prereg_status_breakdown(timestamptz, timestamptz) from public;
revoke execute on function analytics_visits_by_hour(timestamptz, timestamptz) from public;
revoke execute on function analytics_visits_by_weekday(timestamptz, timestamptz) from public;

grant execute on function analytics_visits_by_month(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function analytics_top_visitor_companies(timestamptz, timestamptz, int) to authenticated, service_role;
grant execute on function analytics_top_hosts(timestamptz, timestamptz, int) to authenticated, service_role;
grant execute on function analytics_prereg_status_breakdown(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function analytics_visits_by_hour(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function analytics_visits_by_weekday(timestamptz, timestamptz) to authenticated, service_role;
