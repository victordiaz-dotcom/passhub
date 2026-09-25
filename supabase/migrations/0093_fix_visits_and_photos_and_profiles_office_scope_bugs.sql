-- Hallazgos de una revisión externa (Codex), verificados como reales:
--
-- 1. CRÍTICO: visits_select/insert/update tenían "office_id is null" como
--    condición SUELTA (sin ningún AND de rol), agregada al reestructurar la
--    política en la migración 0092 -- cualquier cuenta autenticada,
--    incluida guardia, podía leer/crear/modificar CUALQUIER visita sin
--    oficina, sin que su rol importara. Se corrige agrupando la excepción
--    de "sin oficina" DENTRO del chequeo de rol, como ya está bien hecho en
--    prereg_select/prereg_update.
drop policy visits_select on visits;
create policy visits_select on visits for select to authenticated using (
  has_role(auth.uid(), 'superadmin')
  or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
      and (office_id is null or office_id = my_office_id()))
);

drop policy visits_insert on visits;
create policy visits_insert on visits for insert to authenticated with check (
  has_role(auth.uid(), 'superadmin')
  or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
      and (office_id is null or office_id = my_office_id()))
);

drop policy visits_update on visits;
create policy visits_update on visits for update to authenticated using (
  has_role(auth.uid(), 'superadmin')
  or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
      and (office_id is null or office_id = my_office_id()))
) with check (
  has_role(auth.uid(), 'superadmin')
  or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
      and (office_id is null or office_id = my_office_id()))
);

-- 2. ALTO: las fotos de visitante/identificación (bucket visit-photos) solo
--    comprobaban el rol de admin/recepción, nunca la oficina de la visita
--    dueña de esa foto -- cualquier recepción podía ver/reemplazar fotos de
--    cualquier oficina. Se agrega el mismo criterio de office_id que ya
--    tiene visits, verificando contra la visita real dueña del archivo
--    (igual patrón que visit_photos_select_guardia, que ya hacía este join).
drop policy visit_photos_select on storage.objects;
create policy visit_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'visit-photos' and (
    has_role(auth.uid(), 'superadmin')
    or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')) and exists (
      select 1 from visits v
      where (v.visitor_photo_path = objects.name or v.id_photo_path = objects.name)
        and (v.office_id is null or v.office_id = my_office_id())
    ))
  )
);

drop policy visit_photos_update on storage.objects;
create policy visit_photos_update on storage.objects for update to authenticated using (
  bucket_id = 'visit-photos' and (
    has_role(auth.uid(), 'superadmin')
    or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')) and exists (
      select 1 from visits v
      where (v.visitor_photo_path = objects.name or v.id_photo_path = objects.name)
        and (v.office_id is null or v.office_id = my_office_id())
    ))
  )
) with check (
  bucket_id = 'visit-photos' and (
    has_role(auth.uid(), 'superadmin')
    or ((has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion')) and exists (
      select 1 from visits v
      where (v.visitor_photo_path = objects.name or v.id_photo_path = objects.name)
        and (v.office_id is null or v.office_id = my_office_id())
    ))
  )
);

-- 3. ALTO: profiles_select no filtraba por oficina en absoluto -- un admin
--    de Madrid podía leer los perfiles (nombre, correo, etc.) de TODAS las
--    cuentas de TODAS las oficinas. Mismo criterio "solo superadmin ve
--    todo" ya aplicado a employees_select esta sesión.
drop policy profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (
  id = auth.uid()
  or has_role(auth.uid(), 'superadmin')
  or (has_role(auth.uid(), 'admin') and office_id = my_office_id())
);
