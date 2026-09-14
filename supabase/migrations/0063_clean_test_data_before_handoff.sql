-- Limpieza final de datos de prueba antes de entregar el proyecto para
-- despliegue en otra infraestructura. Confirmado explícitamente con Victor
-- (2026-09-14) cuáles cuentas/datos son de prueba vs reales. Respaldo
-- completo guardado localmente antes de ejecutar esto (fuera del repo:
-- ~/passhub-backups/pre-cleanup-backup-2026-09-14.json).
--
-- Se conservan: las 3 cuentas reales (Victor y Tadeo -- superadmin,
-- Cynthia -- admin), las 4 empresas reales, el directorio de 648
-- colaboradores (viene del sync real con Slack, no es dato de prueba),
-- catálogos (visit_types, divisions, preregistro_fields).
--
-- Orden: primero las tablas con FK hacia profiles/auth.users, para no
-- violar ninguna referencia al borrar las cuentas al final.

-- 1) Auditoría acumulada durante desarrollo (93 filas: creación/roles/
--    resets de cuentas, mezcladas entre cuentas reales y de prueba).
delete from public.audit_logs;

-- 2) Visitas y pre-registros de prueba (el equipo probando el flujo de
--    check-in -- nombres como "Ayax", "MIGUEL", visitas a DHL/FedEx/CFE).
delete from public.visits;
delete from public.visit_preregistrations;

-- 3) Las 4 cuentas de prueba: Guardia test, Recepcion, admin, superadmin
--    (todas @test.com). user_roles y profiles antes que auth.users, por FK.
delete from public.user_roles
  where user_id in (
    '52c35e55-7b59-4e9a-a282-46d9f8bf91ce', -- guardia@test.com
    'e4fce061-441a-447c-bbbf-064660174509', -- recepcion@test.com
    '1a603a74-70e7-4067-9669-416589dc3146', -- admin@test.com
    'a04e5c44-1c3f-4fc7-a3cd-ca7a00117b5f'  -- super@test.com
  );

delete from public.profiles
  where id in (
    '52c35e55-7b59-4e9a-a282-46d9f8bf91ce',
    'e4fce061-441a-447c-bbbf-064660174509',
    '1a603a74-70e7-4067-9669-416589dc3146',
    'a04e5c44-1c3f-4fc7-a3cd-ca7a00117b5f'
  );

delete from auth.users
  where id in (
    '52c35e55-7b59-4e9a-a282-46d9f8bf91ce',
    'e4fce061-441a-447c-bbbf-064660174509',
    '1a603a74-70e7-4067-9669-416589dc3146',
    'a04e5c44-1c3f-4fc7-a3cd-ca7a00117b5f'
  );
