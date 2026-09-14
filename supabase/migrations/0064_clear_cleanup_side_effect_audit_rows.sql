-- Las 4 filas que quedaron en audit_logs tras 0063 son el propio trigger
-- audit_user_roles() disparándose al borrar los user_roles de las 4
-- cuentas de prueba (revoke_role, actor_id null porque corrió fuera de la
-- app) -- no son historial real, son ruido de la limpieza misma. Se
-- limpian para que el sistema arranque con audit_logs en cero.
delete from public.audit_logs;
