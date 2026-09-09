-- Mismo hueco que ya se corrigió en 0042/0044 para tablas y funciones,
-- pero nunca se aplicó a las policies de storage.objects del bucket
-- visit-photos: solo chequeaban admin/recepcion, sin superadmin. Una
-- cuenta con SOLO el rol superadmin (como la de Victor, ver migración
-- de la tarea "deja la cuenta de Victor solo con superadmin") no podía
-- subir/ver/actualizar/borrar fotos de visita.

alter policy visit_photos_insert on storage.objects
  with check (
    bucket_id = 'visit-photos'
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin'))
  );

alter policy visit_photos_select on storage.objects
  using (
    bucket_id = 'visit-photos'
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin'))
  );

alter policy visit_photos_update on storage.objects
  using (
    bucket_id = 'visit-photos'
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin'))
  )
  with check (
    bucket_id = 'visit-photos'
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin'))
  );

alter policy visit_photos_delete on storage.objects
  using (
    bucket_id = 'visit-photos'
    and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
  );
