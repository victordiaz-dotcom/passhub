-- Hallazgo menor de la misma auditoría (previa a dar acceso a testers
-- externos): prereg_update permitía cambiar office_id libremente -- el
-- USING ya restringe qué filas se pueden tocar por oficina, pero el WITH
-- CHECK no revisaba a qué oficina se reasignaba después. No es una fuga de
-- lectura (el update exitoso puede volver la fila invisible para quien la
-- tocó), pero sí permite desviar/huerfanar un pre-registro hacia otra
-- oficina sin querer. Se deja fijo salvo para superadmin, mismo criterio
-- que se aplicó en la migración 0086 para profiles.
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
  (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin'))
  and (
    has_role(auth.uid(), 'superadmin')
    or office_id is not distinct from (select p.office_id from visit_preregistrations p where p.id = visit_preregistrations.id)
  )
);
