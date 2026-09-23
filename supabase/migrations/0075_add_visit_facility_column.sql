-- Solo en el ambiente de prueba por ahora (parte de v2). Aplicable a la
-- oficina Monterrey (ver CheckIn.tsx): qué instalación visitan dentro del
-- campus -- L3 o instalaciones de Envia.com. Nullable a nivel de columna
-- (como division/reason): la app decide cuándo es obligatorio, no la base.
alter table visits add column facility text;
