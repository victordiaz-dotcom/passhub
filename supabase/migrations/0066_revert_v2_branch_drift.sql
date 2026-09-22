-- Revierte un experimento de la rama v2-office-scoping-qr que se aplicó
-- directamente a este proyecto de Supabase -- no existe un ambiente de v2
-- separado, así que las migraciones/funciones de esa rama quedaron vivas
-- en producción aunque `main` nunca las tuvo. Detectado en la revisión de
-- seguridad del 22 sep 2026, antes de retomar trabajo sobre v1. Esto deja
-- producción exactamente como `main` la documenta hasta la migración 0065.

-- 1. employees_select vuelve a su estado final documentado en 0059
--    (using (true) -- confirmado intencional el 2026-09-10).
alter policy employees_select on employees using (true);

-- 2. Función auxiliar de v2 (my_office_id), sin uso tras el paso anterior.
drop function if exists my_office_id();

-- 3-4. Columnas agregadas solo en v2.
alter table employees drop column if exists office_id;
alter table profiles drop column if exists office_id;

-- 5. Catálogo agregado solo en v2.
drop table if exists offices;

-- 6. La versión v2 de sync-employees (ya revertida también en el código
--    de la Edge Function) había activado colaboradores de Colombia y
--    España, que `main` nunca sincroniza. Mismo criterio que 0054, para
--    dejar los datos consistentes con el código que vuelve a estar
--    desplegado (solo country = 'MX').
update employees
set active = false
where country in ('CO', 'ES') and active = true;
