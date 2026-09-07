-- Recepción debe poder registrar la salida de cualquier visita, sin importar
-- quién la haya registrado (antes solo podía cerrar las que ella misma
-- creó, igual que ya podía admin desde antes). Quién entró y quién marcó la
-- salida ya quedan registrados por separado (created_by/checked_out_by, y el
-- trigger de 0010 sigue forzando que checked_out_by sea quien hace la
-- llamada), así que restringir el UPDATE por creador no aporta seguridad
-- real, solo fricción operativa.
drop policy visits_update on visits;
create policy visits_update on visits for update to authenticated using (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
) with check (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
);
