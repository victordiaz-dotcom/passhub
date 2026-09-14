-- Empresa de prueba creada por accidente en el catálogo (ya estaba inactiva,
-- pero seguía apareciendo en Catálogos → Empresas). Confirmado sin
-- referencias en employees/divisions/profiles antes de borrarla.
delete from public.companies where id = 'af09cf13-635b-46b5-bf49-91e806e0af81';
