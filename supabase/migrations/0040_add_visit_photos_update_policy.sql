-- Bug encontrado al implementar el reemplazo de fotos "en el mismo lugar"
-- (upsert:true sobre la misma ruta por sección, para que nunca se acumule
-- más de una foto por sección — CheckIn.tsx / PhotoUploadField). El bucket
-- visit-photos tenía políticas de INSERT/SELECT/DELETE en storage.objects
-- pero ninguna de UPDATE: un upsert hace INSERT ... ON CONFLICT DO UPDATE,
-- y sin policy de UPDATE, RLS deniega esa rama por default incluso para
-- admin/recepción, que sí pueden subir la primera foto pero no reemplazarla.
-- Mismo alcance que ya tenía INSERT (admin o recepción) — no amplía permisos
-- más allá de lo que ya podían hacer (subir cualquier ruta nueva).

create policy visit_photos_update on storage.objects
for update to authenticated
using (
  bucket_id = 'visit-photos'
  and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
)
with check (
  bucket_id = 'visit-photos'
  and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
);
