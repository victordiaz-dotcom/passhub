-- Reconcilia el historial local con 3 cambios de esquema que se aplicaron
-- directamente a Supabase en su momento (28 ago 2026) sin guardarse como
-- archivo local: employees_global_directory, fix_folio_trigger_rls_undercount
-- y lock_down_folio_trigger_execute/lock_down_trigger_only_functions_execute.
-- Se combinan aquí en un solo archivo porque lo que importa para poder
-- reconstruir la base desde cero es el ESTADO final, no la secuencia exacta
-- en la que se aplicaron originalmente.
--
-- 1) employees_select: la política original (migración 0003) limitaba a
--    "admin o mismo company_id". En algún punto se cambió a "true" (todo
--    usuario autenticado ve el directorio completo de las 4 empresas) para
--    que recepción pueda elegir como anfitrión a cualquier colaborador, sin
--    importar en qué empresa esté, ya que la recepción es compartida entre
--    las 4. Confirmado con el equipo (2026-09-10): este es el comportamiento
--    deseado, se deja así a propósito.
drop policy if exists employees_select on employees;
create policy employees_select on employees for select to authenticated using (true);

-- 2) generate_visit_folio(): en la definición original (migración 0002) no
--    era SECURITY DEFINER, así que el conteo de folios del día
--    ("select count(*) from visits where visit_date = ...") corría con los
--    privilegios/RLS del rol que hacía el INSERT. Antes de que recepción
--    pudiera ver todas las empresas (ver migración 0012), esto podía
--    subcontar folios si RLS le ocultaba visitas de otras empresas al rol
--    que insertaba, generando folios duplicados entre empresas el mismo
--    día. Se hace SECURITY DEFINER para que el conteo siempre vea todas las
--    visitas del día, sin importar el rol que dispara el INSERT.
alter function public.generate_visit_folio() security definer;

-- 3) Al volverse SECURITY DEFINER, generate_visit_folio() quedaba invocable
--    directo por RPC con privilegios elevados si no se le revocaba EXECUTE
--    -- mismo patrón que audit_visits()/audit_user_roles() (migración
--    0005) y audit_catalog_change() (migración 0057).
revoke execute on function public.generate_visit_folio() from public, anon, authenticated;
