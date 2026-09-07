-- "Registró"/"Marcó salida" en Historial/Panel de control se resolvían con
-- un JOIN a profiles (creator/checkout_profile). created_by y checked_out_by
-- SIEMPRE están poblados correctamente (verificado: 0 filas con created_by
-- nulo, 0 filas "fuera" con checked_out_by nulo) — el "—" que se veía no era
-- un dato faltante, sino que profiles_select solo deja leer tu propia fila
-- (o todas si eres admin): una cuenta de recepción no podía resolver el
-- nombre de OTRA cuenta de recepción que hubiera hecho la otra mitad de la
-- acción en esa misma visita.
--
-- En vez de aflojar el acceso a profiles (expondría correo/usuario de
-- cualquier cuenta a cualquier otra), se graba el nombre directamente en la
-- fila de visits en el momento de la acción — un registro de auditoría no
-- debería depender de qué tanto pueda ver después quien lo consulta, ni
-- cambiar si esa cuenta se renombra o desactiva más adelante.
alter table visits add column if not exists created_by_name text;
alter table visits add column if not exists checked_out_by_name text;

-- Backfill de las filas existentes: no es dato inventado — created_by/
-- checked_out_by ya apuntaban correctamente a estas cuentas, esto solo hace
-- visible su nombre actual sin depender del JOIN restringido por RLS.
update visits v
set created_by_name = p.full_name
from profiles p
where p.id = v.created_by and v.created_by_name is null;

update visits v
set checked_out_by_name = p.full_name
from profiles p
where p.id = v.checked_out_by and v.checked_out_by is not null and v.checked_out_by_name is null;

-- De aquí en adelante, la base de datos graba el nombre de quien hace la
-- acción tomándolo de auth.uid() en el momento exacto del insert/update —
-- no depende de que el frontend lo mande (ni de que pueda mandarlo bien):
-- ambos siempre están leyendo su PROPIA fila de profiles, que profiles_select
-- ya permite sin restricción.
create or replace function public.stamp_visit_actor_names()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    select full_name into new.created_by_name from profiles where id = auth.uid();
  elsif tg_op = 'UPDATE' then
    if new.checked_out_by is distinct from old.checked_out_by and new.checked_out_by is not null then
      select full_name into new.checked_out_by_name from profiles where id = new.checked_out_by;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_visit_actor_names on visits;
create trigger trg_stamp_visit_actor_names
before insert or update on visits
for each row execute function public.stamp_visit_actor_names();
