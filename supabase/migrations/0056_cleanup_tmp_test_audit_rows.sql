-- Limpieza puntual de audit_logs generados por la verificación end-to-end
-- del panel de "Campos de pre-registro" (migración 0055) -- no afecta
-- ninguna cuenta ni dato real.
delete from audit_logs where entity = 'preregistro_fields' and detail->>'field_key' = 'custom_tmp_verify_area';
delete from audit_logs where entity = 'preregistro_fields' and detail->'new'->>'field_key' = 'reason' and created_at > now() - interval '1 hour';
