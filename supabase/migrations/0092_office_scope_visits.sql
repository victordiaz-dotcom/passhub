-- Hallazgo de la auditoría de seguridad post-v2, confirmado con Victor:
-- visits (Historial, Panel de control) y las 4 funciones de analíticas que
-- leen de ahí (analytics_visits_by_hour/month/weekday,
-- analytics_top_visitor_companies -- todas SECURITY INVOKER, así que
-- heredan este filtro automáticamente sin tocar su código) no tenían
-- NINGÚN filtro por oficina, aunque colaboradores y pre-registros ya sí.
-- Un admin/recepción de Madrid veía y contaba visitas de Monterrey y
-- viceversa.
--
-- A diferencia de employees_select (donde "sin oficina" se cerró sin
-- excepción): aquí SÍ se deja "office_id is null" como visible para
-- todos, porque son visitas de ANTES de que existiera esta columna
-- (migración 0089) -- no se les puede asignar oficina retroactivamente, y
-- Historial existe precisamente para conservar ese registro completo. Solo
-- las visitas nuevas (con office_id ya guardado) quedan restringidas por
-- oficina.
drop policy visits_select on visits;
create policy visits_select on visits for select to authenticated using (
  has_role(auth.uid(), 'superadmin')
  or office_id is null
  or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')) and office_id = my_office_id())
);

drop policy visits_insert on visits;
create policy visits_insert on visits for insert to authenticated with check (
  has_role(auth.uid(), 'superadmin')
  or office_id is null
  or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')) and office_id = my_office_id())
);

drop policy visits_update on visits;
create policy visits_update on visits for update to authenticated using (
  has_role(auth.uid(), 'superadmin')
  or office_id is null
  or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')) and office_id = my_office_id())
) with check (
  has_role(auth.uid(), 'superadmin')
  or office_id is null
  or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')) and office_id = my_office_id())
);

-- Guardia solo debe ver quién está dentro de SU edificio, no de todos.
drop policy visits_select_guardia on visits;
create policy visits_select_guardia on visits for select to authenticated using (
  has_role(auth.uid(), 'guardia')
  and status = 'dentro'
  and (office_id is null or office_id = my_office_id())
);
