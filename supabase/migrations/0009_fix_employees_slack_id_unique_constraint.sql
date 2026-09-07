-- El índice único parcial (WHERE slack_id IS NOT NULL) no es compatible como
-- target de ON CONFLICT (slack_id) del upsert que hace sync-employees —
-- Postgres exige que el INSERT repita el mismo WHERE para usarlo como árbitro,
-- y el upsert de supabase-js no lo hace. Una restricción única normal se
-- comporta igual para NULLs (nunca colisionan) pero sí sirve como árbitro.
drop index if exists employees_slack_id_key;
alter table employees add constraint employees_slack_id_key unique (slack_id);
