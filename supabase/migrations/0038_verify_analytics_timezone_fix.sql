-- Verificación del fix de zona horaria aplicado en la migración 0037.
-- Inserta 2 visitas sintéticas con check_in_at después de las 6pm hora de
-- Monterrey (una cruzando el borde de medianoche/mes, la otra no), comprueba
-- que el mes/hora/día de semana calculados con 'America/Monterrey' coinciden
-- con lo esperado, y borra las filas de prueba al final. Si alguna
-- verificación falla, RAISE EXCEPTION revierte toda la transacción
-- (incluyendo los inserts), así que no puede quedar dato de prueba residual
-- en ningún escenario.

do $$
declare
  v_company_id uuid := 'f1d32762-5ff2-43ef-8b70-cf9c62106042'; -- Tendencys Innovations
  v_created_by uuid := '70500db6-223d-4a27-83fd-81664e55b0d4'; -- Victor Hugo Diaz Olmos
  v_id_a uuid;
  v_id_b uuid;
  v_month_a date;
  v_hour_a int;
  v_dow_a int;
  v_month_b date;
  v_hour_b int;
  v_dow_b int;
begin
  -- Fila A: 31 de agosto 2026, 11:30pm hora local (lunes) -> cruza a
  -- septiembre en UTC. Esperado en hora local: mes=agosto, hora=23, dow=1.
  insert into visits (company_id, visitor_name, visitor_photo_path, id_photo_path, check_in_at, status, created_by)
  values (v_company_id, 'TEST TZ FIX A', 'test/placeholder.jpg', 'test/placeholder.jpg',
          '2026-08-31 23:30:00-06'::timestamptz, 'fuera', v_created_by)
  returning id into v_id_a;

  -- Fila B: 5 de septiembre 2026, 8:15pm hora local (sábado) -> no cruza de
  -- mes, pero sí de día en UTC. Esperado en hora local: mes=septiembre,
  -- hora=20, dow=6.
  insert into visits (company_id, visitor_name, visitor_photo_path, id_photo_path, check_in_at, status, created_by)
  values (v_company_id, 'TEST TZ FIX B', 'test/placeholder.jpg', 'test/placeholder.jpg',
          '2026-09-05 20:15:00-06'::timestamptz, 'fuera', v_created_by)
  returning id into v_id_b;

  select date_trunc('month', check_in_at at time zone 'America/Monterrey')::date,
         extract(hour from check_in_at at time zone 'America/Monterrey')::int,
         extract(dow from check_in_at at time zone 'America/Monterrey')::int
    into v_month_a, v_hour_a, v_dow_a
  from visits where id = v_id_a;

  select date_trunc('month', check_in_at at time zone 'America/Monterrey')::date,
         extract(hour from check_in_at at time zone 'America/Monterrey')::int,
         extract(dow from check_in_at at time zone 'America/Monterrey')::int
    into v_month_b, v_hour_b, v_dow_b
  from visits where id = v_id_b;

  if v_month_a <> date '2026-08-01' or v_hour_a <> 23 or v_dow_a <> 1 then
    raise exception 'Verificación fallida para fila A: month=%, hour=%, dow=% (esperado 2026-08-01 / 23 / 1)',
      v_month_a, v_hour_a, v_dow_a;
  end if;

  if v_month_b <> date '2026-09-01' or v_hour_b <> 20 or v_dow_b <> 6 then
    raise exception 'Verificación fallida para fila B: month=%, hour=%, dow=% (esperado 2026-09-01 / 20 / 6)',
      v_month_b, v_hour_b, v_dow_b;
  end if;

  delete from visits where id in (v_id_a, v_id_b);
end;
$$;
