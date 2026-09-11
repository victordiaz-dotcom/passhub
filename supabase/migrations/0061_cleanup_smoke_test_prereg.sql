-- Limpieza de un pre-registro de prueba creado durante el barrido de
-- verificación pre-producción (confirmar que create/get/validación de
-- teléfono siguen funcionando después de la migración de companies.id
-- que quedó en pausa).
delete from visit_preregistrations where visitor_name = 'Smoke Test Diagnostico';
