-- Limpieza de las 2 filas de audit_logs generadas por el incidente del bug
-- de handleUpdate() (ver migración 0072): el revoke_role accidental y el
-- grant_role de restauración manual, ambas sobre la propia cuenta de
-- victor.diaz@tendencys.com el 2026-09-23. No son historial real de
-- cambios de rol deliberados -- se identifican por id fijo, no por fecha,
-- para no arriesgar borrar otro cambio real de rol que hubiera ocurrido el
-- mismo día.
delete from audit_logs where id in (
  '471a18a5-5e49-4542-88c1-1f8bf0c8dc97',
  'bb50359c-dfd1-41ae-841a-7f881ec513c5'
);
