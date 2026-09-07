-- Limpieza de datos de prueba antes de producción. Lista confirmada
-- explícitamente por el usuario, con respaldo de las filas exportado antes
-- de este borrado (backups/pre-cleanup-backup-2026-09-08.json, fuera de
-- git). Orden: primero lo que referencia a profiles (audit_logs, visits,
-- visit_preregistrations), luego profiles (arrastra user_roles por
-- cascada), y al final auth.users. No se toca companies, divisions,
-- visit_types ni employees — ninguno es dato de prueba. Los 30 archivos de
-- storage de estas visitas se borraron aparte, vía la Storage API (Supabase
-- bloquea DELETE directo sobre storage.objects por SQL).

delete from audit_logs;

delete from visits where id in (
  '3bae5ecb-48a7-41bd-a712-89bac874cd55',
  'df611dff-6794-4c5e-806b-6a24bc74f0a8',
  'bcdc3cb3-e57e-4f4a-925d-3f5bc6fd8a0b',
  '040febf3-9f85-4bad-a2d8-0b65d3cc2052',
  'd2055bb8-63ab-45b5-8696-8ac765745568',
  '97ab406b-548f-493c-9be3-b36c45734f9e',
  '09b34a77-d56c-4ceb-ace9-92ed0ada648c',
  '5abd941b-72aa-4bb6-a031-3a98e126454c',
  '12e3a157-29c0-426f-b999-2c0162a768ae',
  '05eb5a65-a5c6-48f7-acf9-ea38049c5c43',
  '749575b7-d5a4-4cf5-88c5-758b2bac6243',
  '2965d80a-fc87-4638-9761-995fd292b3d4',
  '71936ed7-14b6-484d-933a-ed0f46a60e3a',
  '6aa5196d-ca71-48cf-9a7c-d9ce1dec1585',
  '53e45e0a-b035-4e7f-bae8-61ad3a2d9a2d'
);

delete from visit_preregistrations where id in (
  '6e98041d-8a3e-454d-a159-a6a7185ec39f',
  'fc082432-8769-4b55-ad93-5ae3728e77a3',
  '9277b0b1-f975-425d-b957-091fc471ac20',
  '1b480233-d78a-479f-97b0-24d677cbe0e5',
  '21272734-9efc-43cb-a2c1-9110bb001794',
  'ecc7f330-2d2b-4daf-a715-670f54596048',
  '97498d98-057b-49d6-ac42-ba71a325ff3a',
  'a5d393e9-263f-401a-a2df-9017dac6c902',
  '5d2d1254-a83a-4b57-a607-239e5247e364'
);

delete from profiles where id in (
  '31fe0f05-e042-4717-b430-f00a293ba65a',
  '5952a266-0812-4ab8-a039-7884a62dbcbf',
  '0ba2869e-1822-4bf5-a200-7b7d082f209a',
  '5869f0c5-9cc7-49fa-a956-0ba0844e7ec4',
  '2d9ce4ac-d009-4b8a-99b9-b530339fd53d',
  '78e0442f-2e93-4f9c-bee5-344ba6e4a523'
);

delete from auth.users where id in (
  '31fe0f05-e042-4717-b430-f00a293ba65a',
  '5952a266-0812-4ab8-a039-7884a62dbcbf',
  '0ba2869e-1822-4bf5-a200-7b7d082f209a',
  '5869f0c5-9cc7-49fa-a956-0ba0844e7ec4',
  '2d9ce4ac-d009-4b8a-99b9-b530339fd53d',
  '78e0442f-2e93-4f9c-bee5-344ba6e4a523'
);
