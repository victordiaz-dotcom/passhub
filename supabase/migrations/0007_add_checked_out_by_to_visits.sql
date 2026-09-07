-- Ya aplicada directamente en el proyecto remoto; este archivo solo la
-- documenta en el repo para que el historial de migraciones no quede
-- incompleto. Permite conservar quién registró la salida de una visita,
-- igual que created_by conserva quién hizo el check-in.
alter table visits add column if not exists checked_out_by uuid references profiles(id);
