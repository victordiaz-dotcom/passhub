-- URGENTE: revierte visit_photos_update de la migración 0093 -- las fotos
-- se suben con upsert:true SIEMPRE sobre una ruta fija
-- (PhotoUploadField.tsx), ANTES de que exista la fila de visits que las
-- referencia. Postgres exige que la política de UPDATE (no solo INSERT) se
-- cumpla en un "insert ... on conflict do update", así que pedir un match
-- contra visits ahí era imposible de cumplir SIEMPRE (la visita todavía no
-- existe) y rompió todas las subidas de foto en producción, no solo
-- algunas.
--
-- El filtro por oficina para fotos se queda solo en visit_photos_select
-- (ver/leer una foto ya existente, cuando la visita sí existe) -- ahí sí
-- tiene sentido y no bloquea nada.
drop policy visit_photos_update on storage.objects;
create policy visit_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'visit-photos' and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin'))
) with check (
  bucket_id = 'visit-photos' and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin'))
);
