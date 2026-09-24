-- "Cada país solo debe ver lo suyo": recepción/admin de Monterrey no debe
-- ver pre-registros dirigidos a Madrid, y viceversa. Hasta ahora
-- prereg_select/prereg_update no tenían NINGÚN filtro por oficina --
-- cualquier admin/recepción veía y podía usar el pre-registro de cualquier
-- oficina, incluyendo la pantalla de "Preregistros" en Historial.tsx y el
-- escaneo de QR en CheckIn.tsx.
--
-- Mismo criterio que employees_select (migración 0069): superadmin ve todo;
-- una cuenta sin oficina asignada (my_office_id() null) ve todo, porque no
-- está restringida a ninguna oficina; un pre-registro sin oficina
-- (office_id null -- los que ya existían antes de que esta columna se
-- empezara a llenar) se ve desde cualquier oficina, en vez de quedar
-- huérfano; en cualquier otro caso, la oficina del pre-registro debe
-- coincidir con la de quien consulta.
drop policy prereg_select on visit_preregistrations;
create policy prereg_select on visit_preregistrations for select to authenticated using (
  (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin'))
  and (
    has_role(auth.uid(), 'superadmin')
    or my_office_id() is null
    or office_id is null
    or office_id = my_office_id()
  )
);

drop policy prereg_update on visit_preregistrations;
create policy prereg_update on visit_preregistrations for update to authenticated using (
  (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin'))
  and (
    has_role(auth.uid(), 'superadmin')
    or my_office_id() is null
    or office_id is null
    or office_id = my_office_id()
  )
) with check (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin')
);
