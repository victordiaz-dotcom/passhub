-- Se abre el acceso entre empresas para recepción: una sola cuenta de
-- recepción atiende a las 4 empresas desde un solo mostrador físico, así que
-- ya no debe estar amarrada a la empresa de su perfil para leer/escribir
-- visits, visit_preregistrations, ni para subir fotos a storage. Admin ya
-- veía todo por su cuenta; ahora recepción tiene el mismo alcance entre
-- empresas (pero solo entre esas dos tablas + storage, el resto de las
-- políticas de la app no cambian).

drop policy visits_select on visits;
create policy visits_select on visits for select to authenticated using (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
);

drop policy visits_insert on visits;
create policy visits_insert on visits for insert to authenticated with check (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
);

drop policy visits_update on visits;
create policy visits_update on visits for update to authenticated using (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
) with check (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
);

drop policy prereg_select on visit_preregistrations;
create policy prereg_select on visit_preregistrations for select to authenticated using (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
);

drop policy prereg_insert on visit_preregistrations;
create policy prereg_insert on visit_preregistrations for insert to authenticated with check (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
);

drop policy prereg_update on visit_preregistrations;
create policy prereg_update on visit_preregistrations for update to authenticated using (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
) with check (
  has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')
);

drop policy visit_photos_select on storage.objects;
create policy visit_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'visit-photos' and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
);

drop policy visit_photos_insert on storage.objects;
create policy visit_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'visit-photos' and (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
);
