-- Limpieza de un pre-registro de prueba creado al diagnosticar el reporte
-- "no genera el QR" (se confirmó que create/get del backend funcionan bien
-- con datos reales; el problema quedó aislado al front).
delete from visit_preregistrations where visitor_name = 'Tmp Verify QR';
