-- Corrige los hallazgos HIGH/MEDIUM confirmados por el panel de Claude
-- Security (dos escaneos completos, 2026-09-26/27) antes de promover v2 a
-- producción. Cada bloque cita el hallazgo que cierra.

-- ---------------------------------------------------------------------
-- F1/F10 (escaneo 2) y F3 (escaneo 1): profiles_admin_update no exigía
-- que la fila objetivo fuera de la propia oficina del que llama (el
-- office_id solo se fijaba en WITH CHECK, nunca en USING), y tampoco
-- bloqueaba que un admin no-superadmin tocara una cuenta admin/superadmin
-- -- a diferencia de update-user-email/reset-user-password, que sí lo
-- hacen. company_id NO se fija a propósito: varias empresas comparten
-- oficina y reasignar la empresa de una cuenta dentro de la misma
-- oficina es un cambio legítimo (mismo criterio que create-user).
-- ---------------------------------------------------------------------
alter policy profiles_admin_update on profiles
  using (
    has_role(auth.uid(), 'superadmin')
    or (
      has_role(auth.uid(), 'admin')
      and (my_office_id() is null or office_id = my_office_id())
      and not exists (
        select 1 from user_roles ur
        where ur.user_id = profiles.id and ur.role in ('admin', 'superadmin')
      )
    )
  )
  with check (
    (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
    and (
      active = (select p2.active from profiles p2 where p2.id = profiles.id)
      or has_role(auth.uid(), 'superadmin')
    )
    and (not (email is distinct from (select p2.email from profiles p2 where p2.id = profiles.id)))
    and (
      has_role(auth.uid(), 'superadmin')
      or my_office_id() is null
      or not (office_id is distinct from my_office_id())
    )
  );

-- ---------------------------------------------------------------------
-- F2 (escaneo 2) / F9 (escaneo 1): profiles_update_self no fijaba
-- must_change_password, así que cualquier cuenta podía apagar la bandera
-- de "debe cambiar su contraseña" sin haberla cambiado nunca, con un
-- PATCH directo. Se fija igual que active/email/company_id/office_id, y
-- se agrega una función SECURITY DEFINER angosta para que
-- ChangePassword.tsx siga pudiendo apagarla, pero solo si la contraseña
-- realmente se acaba de actualizar (auth.users.updated_at reciente).
-- ---------------------------------------------------------------------
alter policy profiles_update_self on profiles
  with check (
    (id = auth.uid())
    and (active = (select p2.active from profiles p2 where p2.id = auth.uid()))
    and (not (email is distinct from (select p2.email from profiles p2 where p2.id = auth.uid())))
    and (not (company_id is distinct from (select p2.company_id from profiles p2 where p2.id = auth.uid())))
    and (not (office_id is distinct from (select p2.office_id from profiles p2 where p2.id = auth.uid())))
    and (not (must_change_password is distinct from (select p2.must_change_password from profiles p2 where p2.id = auth.uid())))
  );

create or replace function clear_own_must_change_password()
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if not exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.updated_at > now() - interval '2 minutes'
  ) then
    raise exception 'La contraseña no se actualizó recientemente.' using errcode = '42501';
  end if;

  update profiles set must_change_password = false where id = auth.uid();
end;
$$;

revoke all on function clear_own_must_change_password() from public;
grant execute on function clear_own_must_change_password() to authenticated;

-- ---------------------------------------------------------------------
-- F1/F2/F11 (escaneo 1): la rama "not exists" de visit_photos_select (la
-- que permite ver una foto todavía no vinculada a un visits, necesaria
-- para el upsert durante la subida) no tenía NINGÚN filtro -- cualquier
-- admin/recepción de cualquier oficina veía cualquier foto huérfana de
-- cualquier otra oficina. Se limita a quien la subió (owner_id, que
-- Supabase Storage llena solo con el auth.uid() de quien sube) hasta que
-- se vincule a un visits, momento en el que la rama "exists" (ya
-- filtrada por oficina) toma el control.
-- ---------------------------------------------------------------------
alter policy visit_photos_select on storage.objects
  using (
    bucket_id = 'visit-photos'
    and (
      has_role(auth.uid(), 'superadmin')
      or (
        (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
        and (
          (
            not exists (
              select 1 from visits v
              where v.visitor_photo_path = objects.name or v.id_photo_path = objects.name
            )
            and owner_id = (auth.uid())::text
          )
          or exists (
            select 1 from visits v
            where (v.visitor_photo_path = objects.name or v.id_photo_path = objects.name)
              and (v.office_id is null or v.office_id = my_office_id())
          )
        )
      )
    )
  );

-- ---------------------------------------------------------------------
-- F4 (escaneo 1) / F7 (escaneo 2): visit_photos_update (0094) se había
-- revertido a solo-rol para no romper el upsert de una foto nueva, pero
-- eso dejó que cualquier admin/recepción sobrescribiera la foto de
-- CUALQUIER oficina. Mismo patrón "not exists (propia) or exists
-- (vinculada, misma oficina)" que ya usa visit_photos_select.
-- ---------------------------------------------------------------------
alter policy visit_photos_update on storage.objects
  using (
    bucket_id = 'visit-photos'
    and (
      has_role(auth.uid(), 'superadmin')
      or (
        (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
        and (
          (
            not exists (
              select 1 from visits v
              where v.visitor_photo_path = objects.name or v.id_photo_path = objects.name
            )
            and owner_id = (auth.uid())::text
          )
          or exists (
            select 1 from visits v
            where (v.visitor_photo_path = objects.name or v.id_photo_path = objects.name)
              and (v.office_id is null or v.office_id = my_office_id())
          )
        )
      )
    )
  )
  with check (
    bucket_id = 'visit-photos'
    and (
      has_role(auth.uid(), 'superadmin')
      or (
        (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion'))
        and (
          (
            not exists (
              select 1 from visits v
              where v.visitor_photo_path = objects.name or v.id_photo_path = objects.name
            )
            and owner_id = (auth.uid())::text
          )
          or exists (
            select 1 from visits v
            where (v.visitor_photo_path = objects.name or v.id_photo_path = objects.name)
              and (v.office_id is null or v.office_id = my_office_id())
          )
        )
      )
    )
  );

-- ---------------------------------------------------------------------
-- F12/F13 (escaneo 1): visit_photos_delete (0050) solo miraba el rol,
-- nunca la oficina de la visita dueña de la foto.
-- ---------------------------------------------------------------------
alter policy visit_photos_delete on storage.objects
  using (
    bucket_id = 'visit-photos'
    and (
      has_role(auth.uid(), 'superadmin')
      or (
        has_role(auth.uid(), 'admin')
        and (
          (
            not exists (
              select 1 from visits v
              where v.visitor_photo_path = objects.name or v.id_photo_path = objects.name
            )
            and owner_id = (auth.uid())::text
          )
          or exists (
            select 1 from visits v
            where (v.visitor_photo_path = objects.name or v.id_photo_path = objects.name)
              and (v.office_id is null or v.office_id = my_office_id())
          )
        )
      )
    )
  );

-- ---------------------------------------------------------------------
-- F6 (escaneo 1): visit_photos_select_guardia nunca recibió el mismo
-- filtro de oficina que visits_select_guardia -- Postgres combina con OR
-- todas las políticas PERMISSIVE de storage.objects, así que un guardia
-- veía fotos de "dentro" de cualquier oficina sin importar lo que
-- visits_select_guardia ya restringía.
-- ---------------------------------------------------------------------
alter policy visit_photos_select_guardia on storage.objects
  using (
    bucket_id = 'visit-photos'
    and has_role(auth.uid(), 'guardia')
    and exists (
      select 1 from visits v
      where v.status = 'dentro'
        and (v.visitor_photo_path = objects.name or v.id_photo_path = objects.name)
        and (v.office_id is null or v.office_id = my_office_id())
    )
  );

-- ---------------------------------------------------------------------
-- Rate limiting atómico (F8/F10/F16 escaneo 1, F9 escaneo 2): el patrón
-- "SELECT count -> luego INSERT" desde el edge function no es atómico
-- -- varias requests concurrentes leen el mismo conteo antes de que
-- cualquiera inserte su fila, así que un atacante con suficientes
-- requests en paralelo excede el límite. Un advisory lock por
-- (bucket, identifier) serializa el chequeo+inserción sin bloquear
-- requests de OTROS buckets/identificadores.
--
-- Dos formas porque resolve-username y public-preregister cuentan cosas
-- distintas: public-preregister limita cada LLAMADA (login correcto o
-- no, todas cuentan) -- rate_limit_try_reserve reserva ANTES de actuar.
-- resolve-username limita solo los FALLOS (un mostrador compartiendo IP
-- no debe autobloquearse por logins correctos, ver comentario ya
-- existente en ese archivo) -- rate_limit_record_failure solo se llama
-- DESPUÉS de un fallo, y devuelve si ya se pasó del límite (para que esa
-- respuesta sea 429 en vez del error genérico, aun cuando el intento de
-- login ya se alcanzó a hacer).
-- ---------------------------------------------------------------------
create or replace function rate_limit_try_reserve(
  p_bucket text, p_identifier text, p_window_minutes int, p_limit int
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext(p_bucket || ':' || p_identifier));

  delete from edge_rate_limits
    where bucket = p_bucket and identifier = p_identifier
      and created_at < now() - make_interval(mins => p_window_minutes);

  select count(*) into v_count
  from edge_rate_limits
  where bucket = p_bucket and identifier = p_identifier;

  if v_count >= p_limit then
    return false;
  end if;

  insert into edge_rate_limits (bucket, identifier) values (p_bucket, p_identifier);
  return true;
end;
$$;

create or replace function rate_limit_record_failure(
  p_bucket text, p_identifier text, p_window_minutes int, p_limit int
)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext(p_bucket || ':' || p_identifier));

  delete from edge_rate_limits
    where bucket = p_bucket and identifier = p_identifier
      and created_at < now() - make_interval(mins => p_window_minutes);

  insert into edge_rate_limits (bucket, identifier) values (p_bucket, p_identifier);

  select count(*) into v_count
  from edge_rate_limits
  where bucket = p_bucket and identifier = p_identifier;

  return v_count > p_limit;
end;
$$;

revoke all on function rate_limit_try_reserve(text, text, int, int) from public;
revoke all on function rate_limit_record_failure(text, text, int, int) from public;
grant execute on function rate_limit_try_reserve(text, text, int, int) to service_role;
grant execute on function rate_limit_record_failure(text, text, int, int) to service_role;
