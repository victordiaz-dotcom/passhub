-- "El único que puede ver todo es superadmin": la condición
-- "office_id IS NULL" del lado del EMPLEADO dejaba ver a cualquier cuenta
-- los colaboradores sin oficina asignada de cualquier país (ej. una
-- recepción de España veía colaboradores de México sin oficina). Se quita
-- esa condición y también la de "mi propia oficina es null" del lado del
-- que consulta: ahora solo superadmin ve todo; el resto solo ve
-- colaboradores de su misma oficina, sin excepción.
--
-- Aplicada primero solo a producción (2026-09-25) sin este archivo; se
-- captura aquí para que passhub-dev quede igual y una reconstrucción desde
-- las migraciones del repo no vuelva a introducir el hueco.
drop policy employees_select on employees;
create policy employees_select on employees for select to authenticated using (
  has_role(auth.uid(), 'superadmin') or office_id = my_office_id()
);
