-- Nuevo nivel de rol para el equipo de desarrollo, por encima de admin.
-- Se agrega en su propia migración porque Postgres no permite usar un valor
-- de enum recién creado dentro de la misma transacción que lo agrega.
alter type app_role add value 'superadmin';
