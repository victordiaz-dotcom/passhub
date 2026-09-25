-- Preparación para 0079 (México = solo Monterrey), aplicada solo en
-- producción: 10 colaboradores reales y activos apuntaban a la oficina
-- "Cd. de México", que esa migración elimina. Se reasignan a Monterrey (la
-- única oficina activa de México) antes de borrar la oficina vieja, para no
-- romper la llave foránea ni dejarlos huérfanos. Confirmado con Victor.
-- No-op en cualquier base sin empleados con ese office_id (ej. passhub-dev,
-- que nunca tuvo datos reales).
update employees
set office_id = '464b05ea-d687-4923-a6af-7a69746640f6'
where office_id = 'da717033-6fd2-4641-8df7-f6cea464e1b9';
