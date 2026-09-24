-- Deja el catálogo de oficinas como quedó acordado, y de paso captura en un
-- archivo cambios que se habían hecho con SQL suelto sobre passhub-dev y no
-- existían en ninguna migración. Sin esto, reconstruir la base desde el repo
-- devolvía las 4 oficinas originales de la migración 0068 (con México otra
-- vez partido en dos, lo que hace reaparecer el selector de oficina que se
-- quitó a propósito).
--
-- Estado acordado: México = solo Monterrey, España = Madrid. Colombia se
-- queda fuera del front por ahora (ver COUNTRY_ORDER en
-- src/lib/countryFlags.ts); la fila de Bogotá se conserva pero inactiva,
-- para no perder el registro ni romper ninguna llave foránea si algún día
-- se retoma.
delete from offices where name = 'Cd. de México' and country = 'MX';

update offices set name = 'Madrid' where name in ('España', 'Madrid, España') and country = 'ES';
update offices set name = 'Bogotá', active = false where name in ('Colombia', 'Bogotá, Colombia') and country = 'CO';
