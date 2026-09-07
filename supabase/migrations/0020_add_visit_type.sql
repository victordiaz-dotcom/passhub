-- Tipo de visita: colaborador o cliente, capturado tanto en el pre-registro
-- público como en el registro manual de recepción/admin. Nullable a nivel
-- de esquema (no se puede inferir para filas ya existentes), pero la UI lo
-- exige como obligatorio en todo registro nuevo.
create type visit_type as enum ('colaborador', 'cliente');

alter table visits add column visit_type visit_type;
alter table visit_preregistrations add column visit_type visit_type;
