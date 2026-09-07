-- Guardia puede ver (no borrar, no subir) las fotos de visitante/INE, pero
-- solo de visitas que están "dentro" en este momento — la misma frontera
-- que ya tiene para la tabla visits, extendida a storage.
create policy visit_photos_select_guardia on storage.objects for select to authenticated using (
  bucket_id = 'visit-photos'
  and has_role(auth.uid(), 'guardia')
  and exists (
    select 1 from visits v
    where v.status = 'dentro'
      and (v.visitor_photo_path = storage.objects.name or v.id_photo_path = storage.objects.name)
  )
);
