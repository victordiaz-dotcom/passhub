-- La columna generada usaba trim() ANTES de colapsar espacios, y el trim()
-- de Postgres solo quita ESPACIOS (no tabuladores ni saltos de línea). Un
-- nombre pegado con un tabulador quedaba normalizado como " juan perez"
-- (con espacio en la orilla), mientras que el front busca con .trim() de
-- JS, que sí quita todo espacio en blanco y produce "juan perez". Es decir:
-- la persona quedaba marcada como vetada pero la advertencia nunca volvía a
-- aparecer. Se invierte el orden: primero colapsar, luego btrim.
--
-- La expresión de una columna generada no se puede alterar en su lugar, así
-- que se recrea (y con ella su índice, que se va al soltar la columna).
-- Comprobado: E'\tJuan   Perez  Vetado\n' -> 'juan perez vetado', idéntico
-- a lo que produce normalizeVisitorName() en el front.
alter table flagged_visitors drop column normalized_name;

alter table flagged_visitors
  add column normalized_name text generated always as (
    lower(btrim(regexp_replace(full_name, '\s+', ' ', 'g')))
  ) stored;

create index flagged_visitors_normalized_name_idx on flagged_visitors (normalized_name);
