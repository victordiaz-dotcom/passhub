-- office_facilities_write (migración 0076) solo comprobaba el rol
-- (admin/superadmin), nunca la oficina -- un admin confinado a una oficina
-- (ej. Madrid) podía insertar/renombrar/desactivar instalaciones de
-- CUALQUIER otra oficina (ej. Monterrey) vía REST directo, aunque la
-- migración 0091 ya había cerrado exactamente esta misma brecha para
-- employees_insert/update/delete. Se aplica el mismo criterio aquí.
--
-- office_facilities.office_id es NOT NULL (a diferencia de employees/visits,
-- que sí permiten office_id null para filas heredadas), así que no hace
-- falta ninguna excepción "office_id is null" -- toda fila tiene una oficina
-- dueña con la que comparar.
--
-- office_facilities no se escribe por upsert desde ningún flujo del front
-- ni de supabase/functions/ (solo se lee: CheckIn.tsx y
-- public-preregister/index.ts hacen puro .select(), este último además vía
-- adminClient con service role, que no pasa por RLS), así que este cambio
-- no corre el mismo riesgo que rompió las subidas de foto en
-- visit_photos_update/select (migraciones 0093-0095): ahí un
-- "insert ... on conflict do update" exigía que la política de SELECT
-- diera por buena una fila que todavía no existía. Aquí no hay ningún
-- "on conflict" contra esta tabla.
drop policy office_facilities_write on office_facilities;
create policy office_facilities_write on office_facilities for all to authenticated
  using (
    has_role(auth.uid(), 'superadmin')
    or (has_role(auth.uid(), 'admin') and office_id = my_office_id())
  )
  with check (
    has_role(auth.uid(), 'superadmin')
    or (has_role(auth.uid(), 'admin') and office_id = my_office_id())
  );
