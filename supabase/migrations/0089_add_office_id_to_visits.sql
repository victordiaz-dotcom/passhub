-- "Envia.com" existe tanto en Monterrey como en Madrid -- guardar solo el
-- nombre de la instalación (visits.facility, migración 0075) no alcanza
-- para que Historial pueda distinguir de qué país es un visitante cuando
-- superadmin ve todo mezclado. Mismo patrón que visit_preregistrations
-- (migración 0080): nullable, los check-ins viejos no tienen oficina y
-- deben seguir siendo válidos.
alter table visits add column office_id uuid references offices(id);
