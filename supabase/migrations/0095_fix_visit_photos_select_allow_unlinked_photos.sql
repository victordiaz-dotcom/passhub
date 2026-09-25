-- URGENTE, causa raíz real de "no dejaba subir fotos a admin/recepción"
-- (la migración 0094 arregló el síntoma equivocado -- era la política de
-- UPDATE la que revertí ahí, pero el verdadero problema estaba en SELECT).
--
-- PhotoUploadField.tsx sube siempre con upsert:true, que Postgres compila
-- como "insert ... on conflict do update". Para resolver el posible
-- conflicto, Postgres necesita poder "ver" el archivo bajo la política de
-- SELECT -- y visit_photos_select (migración 0093) exigía que YA existiera
-- una visita ligada a esa foto para que admin/recepción pudieran verla, algo
-- que nunca es cierto ANTES de crear la visita (la foto se sube primero).
-- Por eso solo superadmin (cuya rama del OR no depende de esa condición)
-- podía subir fotos; admin y recepción quedaban bloqueados con "new row
-- violates row-level security policy" en CUALQUIER subida.
--
-- Verificado en vivo contra passhub-dev con cuentas reales de admin y
-- recepción, subida nueva y re-subida (el camino de conflicto real): ambas
-- devuelven 200 con este fix.
--
-- Se agrega la misma excepción que ya tienen visits/prereg para "sin
-- vínculo todavía": si NINGUNA visita referencia esa foto (se está subiendo
-- ahora, o quedó huérfana), sigue siendo visible para cualquier admin/
-- recepción -- igual que el comportamiento de antes de la migración 0093.
-- Si SÍ hay una visita que la referencia, ahí sí se exige que sea de la
-- oficina de quien consulta (el fix real que pedía la revisión externa).
drop policy visit_photos_select on storage.objects;
create policy visit_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'visit-photos'
  and (
    has_role(auth.uid(), 'superadmin')
    or (
      (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
      and (
        (not exists (
          select 1 from visits v
          where (v.visitor_photo_path = objects.name) or (v.id_photo_path = objects.name)
        ))
        or (exists (
          select 1 from visits v
          where ((v.visitor_photo_path = objects.name) or (v.id_photo_path = objects.name))
            and ((v.office_id is null) or (v.office_id = my_office_id()))
        ))
      )
    )
  )
);
