-- Ya aplicada directamente en el proyecto remoto; este archivo solo la
-- documenta en el repo para que el historial de migraciones no quede
-- incompleto.
alter table visits add column if not exists division text;
alter table visit_preregistrations add column if not exists division text;
alter table profiles add column if not exists must_change_password boolean not null default false;
