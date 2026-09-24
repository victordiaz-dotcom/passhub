-- Igual que Monterrey (Local 3 / Envia.com), Madrid tiene dos instalaciones
-- físicas distintas, cada una con su propia dirección real -- no una sola
-- dirección genérica de oficina. Se agrega address/phone a
-- office_facilities (nullable, como offices.address) para poder guardar la
-- dirección específica de cada una.
alter table office_facilities add column address text;
alter table office_facilities add column phone text;

insert into office_facilities (office_id, name, address)
select id, 'Envia.com', 'Calle Raimundo Fernández Villaverde 79, 28003 Madrid, España'
from offices where name = 'Madrid' and country = 'ES'
union all
select id, 'Fulfillment', 'Calle de Plutón 3, 28830 San Fernando de Henares, Madrid, España'
from offices where name = 'Madrid' and country = 'ES';

-- La dirección genérica de la oficina que se había cargado por error
-- (migración 0082) se borra: la dirección real depende de a cuál de las
-- dos instalaciones va el visitante, no hay una sola dirección de
-- "Madrid" en general.
update offices set address = null where name = 'Madrid' and country = 'ES';
