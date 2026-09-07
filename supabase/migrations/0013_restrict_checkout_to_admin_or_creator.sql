-- Registrar salida de una visita que uno mismo no registró queda reservado
-- a admin. Recepción conserva su alcance entre las 4 empresas para todo lo
-- demás (ver/crear visitas y pre-registros), pero solo puede cerrar
-- (UPDATE) las visitas que ella misma creó.
drop policy visits_update on visits;
create policy visits_update on visits for update to authenticated using (
  has_role(auth.uid(), 'admin') or (has_role(auth.uid(), 'recepcion') and created_by = auth.uid())
) with check (
  has_role(auth.uid(), 'admin') or (has_role(auth.uid(), 'recepcion') and created_by = auth.uid())
);
