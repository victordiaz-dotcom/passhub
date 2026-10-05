-- Ejecutar SOLO en passhub-dev (fzzdpktihplgzskvpxuq), después de desplegar
-- supabase/functions/sync-employees/index.ts.
-- Guardar primero la service_role key de ESTE proyecto en Supabase Vault con
-- el nombre passhub_dev_sync_service_role_key. Nunca pegar la llave aquí.
-- México corre a las 07:00 UTC y Europa a las 07:10 UTC.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $check$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'passhub_dev_sync_service_role_key'
      and decrypted_secret is not null
  ) then
    raise exception 'Falta el secreto passhub_dev_sync_service_role_key en Vault';
  end if;
end
$check$;

select cron.schedule(
  'passhub-dev-sync-employees-mx-daily',
  '0 7 * * *',
  $job$
    select net.http_post(
      url := 'https://fzzdpktihplgzskvpxuq.supabase.co/functions/v1/sync-employees',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'passhub_dev_sync_service_role_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'passhub_dev_sync_service_role_key')
      ),
      body := '{"country":"MX","scheduled":true}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);

select cron.schedule(
  'passhub-dev-sync-employees-eu-daily',
  '10 7 * * *',
  $job$
    select net.http_post(
      url := 'https://fzzdpktihplgzskvpxuq.supabase.co/functions/v1/sync-employees',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'passhub_dev_sync_service_role_key'),
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'passhub_dev_sync_service_role_key')
      ),
      body := '{"country":"ES","scheduled":true}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
