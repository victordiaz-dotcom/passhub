-- employees_select ya quedó "solo superadmin ve todo" (migración 0090),
-- pero insert/update/delete seguían siendo solo un chequeo de rol
-- (admin/superadmin), sin comparar oficina -- un admin confinado a una
-- oficina (ej. Madrid) podía crear/editar/borrar colaboradores de
-- CUALQUIER otra oficina, a ciegas (employees_select ya le ocultaba el
-- resultado después). No hay ningún flujo del front que haga esto hoy
-- (solo sync-employees, que usa service role y no pasa por RLS), pero el
-- modelo de permisos debe ser consistente con employees_select.
drop policy employees_insert on employees;
create policy employees_insert on employees for insert to authenticated with check (
  has_role(auth.uid(), 'superadmin') or (has_role(auth.uid(), 'admin') and office_id = my_office_id())
);

drop policy employees_update on employees;
create policy employees_update on employees for update to authenticated using (
  has_role(auth.uid(), 'superadmin') or (has_role(auth.uid(), 'admin') and office_id = my_office_id())
) with check (
  has_role(auth.uid(), 'superadmin') or (has_role(auth.uid(), 'admin') and office_id = my_office_id())
);

drop policy employees_delete on employees;
create policy employees_delete on employees for delete to authenticated using (
  has_role(auth.uid(), 'superadmin') or (has_role(auth.uid(), 'admin') and office_id = my_office_id())
);
