-- Teléfono y correo del visitante, obligatorios a nivel de app (tanto en el
-- formulario de recepción como en el link público de pre-registro), nulos a
-- nivel de columna por consistencia con el resto de los campos del visitante.
alter table visits add column if not exists visitor_phone text;
alter table visits add column if not exists visitor_email text;
alter table visit_preregistrations add column if not exists visitor_phone text;
alter table visit_preregistrations add column if not exists visitor_email text;
