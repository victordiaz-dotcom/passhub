-- Permite a admin/superadmin agregar o desactivar (no borrar) filas de
-- los 3 catálogos usados como listas desplegables en el registro de
-- visitas: empresas anfitrionas, divisiones y tipos de visita. RLS de
-- escritura ya estaba correcta (admin/superadmin) en las 3 tablas, solo
-- faltaba una columna para desactivar en vez de borrar.
alter table companies add column active boolean not null default true;
alter table divisions add column active boolean not null default true;
alter table visit_types add column active boolean not null default true;

-- visits.division y visit_preregistrations.division tenían un CHECK con
-- una lista fija de 6 valores — una división nueva agregada desde la
-- tabla `divisions` sería rechazada por esta restricción. Ninguna otra
-- columna equivalente (visit_type, company_id) tiene este tipo de
-- restricción; se quita para que "division" funcione igual que las
-- demás: una lista dinámica que alimenta el desplegable, sin enum fijo
-- a nivel de base de datos.
alter table visits drop constraint visits_division_check;
alter table visit_preregistrations drop constraint visit_preregistrations_division_check;
