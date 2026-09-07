-- Guardia ve únicamente las visitas que están "dentro" en este momento —
-- ni historial (fuera), ni ningún permiso de escritura (no se les da ningún
-- policy de insert/update/delete, así que quedan sin acceso por completo a
-- eso, no solo oculto en la UI).
create policy visits_select_guardia on visits for select to authenticated using (
  has_role(auth.uid(), 'guardia') and status = 'dentro'
);
