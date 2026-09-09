-- Tarea 3 de la sesión: la auditoría de acciones de admin es un mecanismo
-- de supervisión de super_admin sobre admin, no algo que un admin normal
-- deba poder leer (incluiría lo que hicieron OTROS admins). La policy
-- previa (migración 0042) incluía a admin junto con superadmin siguiendo
-- el criterio general de "superadmin implica admin", pero aquí es al
-- revés: esta tabla es explícitamente exclusiva de super_admin.
alter policy audit_logs_select on audit_logs
  using (has_role(auth.uid(), 'superadmin'));
