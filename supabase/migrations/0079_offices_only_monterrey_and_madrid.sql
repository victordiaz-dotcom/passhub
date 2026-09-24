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
-- Se filtra por país y NO por nombre: al escribir esto por primera vez el
-- where iba por nombre ('Colombia', 'España', ...) y no coincidió con nada,
-- porque esas filas ya habían sido renombradas a mano antes -- la
-- desactivación de Colombia se quedó sin aplicar en silencio. Por país es
-- idempotente: da igual cómo se llame la fila ahorita.
delete from offices where country = 'MX' and name in ('Cd. de México', 'Ciudad de México', 'CDMX');

update offices set name = 'Madrid' where country = 'ES';
update offices set name = 'Bogotá', active = false where country = 'CO';
