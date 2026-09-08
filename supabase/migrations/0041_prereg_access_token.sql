-- El QR/link público de pre-registro usaba visit_preregistrations.id (la
-- llave primaria interna) como el valor que cualquiera con el link puede
-- usar para leer los datos del visitante sin autenticarse. Mezclar "llave
-- interna de la base" con "capacidad de acceso público" es una mala
-- práctica: si ese id apareciera algún día en otra pantalla/log de staff,
-- automáticamente sería también una llave de acceso público. Se separa con
-- una columna dedicada solo para esto — el id interno deja de ser
-- suficiente para leer el pre-registro por el canal público.

alter table visit_preregistrations
  add column access_token uuid not null default gen_random_uuid();

create unique index visit_preregistrations_access_token_idx
  on visit_preregistrations (access_token);
