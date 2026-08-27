-- Bucket privado para las fotos del visitante y del INE.
-- Convención de rutas: {company_id}/{folio}/visitante.jpg y {company_id}/{folio}/ine.jpg
insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', false)
on conflict (id) do nothing;

create policy visit_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'visit-photos' and (
    public.has_role(auth.uid(),'admin') or
    (public.has_role(auth.uid(),'recepcion') and (storage.foldername(name))[1] = public.current_company_id()::text)
  )
);

create policy visit_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'visit-photos' and (
    public.has_role(auth.uid(),'admin') or
    (public.has_role(auth.uid(),'recepcion') and (storage.foldername(name))[1] = public.current_company_id()::text)
  )
);

create policy visit_photos_delete on storage.objects for delete to authenticated using (
  bucket_id = 'visit-photos' and public.has_role(auth.uid(),'admin')
);
