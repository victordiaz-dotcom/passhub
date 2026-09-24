-- La pantalla de confirmación del pre-registro traía la dirección y el
-- teléfono de Monterrey escritos fijos en el código, así que un visitante
-- que se pre-registra para Madrid recibía la dirección equivocada. Los datos
-- de contacto pertenecen a la oficina, no al código.
alter table offices add column address text;
alter table offices add column phone text;

-- Monterrey: se pasan tal cual los que ya estaban en PreRegistroConfirmacion.
update offices
set address = 'Av. I. Morones Prieto No. 2110, Local 3-B, Col. Loma Larga, C.P. 64710, Monterrey, N.L.',
    phone = '+52 81 2085 8093'
where country = 'MX' and name = 'Monterrey';

-- Madrid queda sin dirección a propósito: no se inventa un domicilio.
-- Mientras esté en null, la confirmación no muestra el bloque de contacto
-- en vez de mostrar uno equivocado. Falta cargar la dirección real de
-- Madrid antes de que se use allá.
