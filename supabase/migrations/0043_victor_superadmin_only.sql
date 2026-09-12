-- A petición del dueño de la cuenta fundadora del sistema: su
-- cuenta tenía 3 roles asignados (recepcion, admin, superadmin) — un
-- remanente de cómo se configuró originalmente la cuenta, antes de que el
-- sistema tratara "superadmin implica admin" de forma consistente (ver
-- migración 0042 y los fixes de frontend en el mismo commit). Con eso ya
-- corregido y verificado, se le deja solo con superadmin: sigue teniendo
-- acceso a todo lo que admin/recepción ya tenían, sin necesitar las filas
-- de rol extra.

delete from user_roles
where user_id = '70500db6-223d-4a27-83fd-81664e55b0d4'
  and role in ('admin', 'recepcion');
