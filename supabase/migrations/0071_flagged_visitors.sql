-- "Persona vetada": al dar salida, recepción/admin puede marcar
-- (checkbox opcional, no bloquea nada) que un visitante tuvo
-- comportamiento violento/hostil, con una nota opcional. Si esa persona
-- vuelve a registrarse, se le muestra una advertencia a recepción y a
-- guardia -- solo informativa, nunca bloquea el registro (confirmado con
-- el usuario). No hay un rol especial para "quién puede marcar": el
-- checkbox vive dentro del mismo diálogo de confirmar salida, así que ya
-- queda limitado a quien puede dar salida (admin/recepción/superadmin).
--
-- normalized_name es columna generada (no depende de que el código de la
-- app siempre normalice bien) -- minúsculas + espacios colapsados, para
-- que "Fulanito Pérez" y "fulanito   perez" hagan match al buscar, que
-- fue el caso explícito que pidió el usuario.
create table flagged_visitors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  normalized_name text generated always as (
    lower(regexp_replace(trim(full_name), '\s+', ' ', 'g'))
  ) stored,
  note text,
  visit_id uuid references visits(id),
  flagged_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create index flagged_visitors_normalized_name_idx on flagged_visitors (normalized_name);

alter table flagged_visitors enable row level security;

-- Todos los roles operativos necesitan poder VER la advertencia (incluido
-- guardia, que solo consulta, nunca marca). Marcar (insert) queda
-- limitado a quien también puede dar salida a una visita.
create policy flagged_visitors_select on flagged_visitors for select to authenticated
  using (
    has_role(auth.uid(), 'admin')
    or has_role(auth.uid(), 'recepcion')
    or has_role(auth.uid(), 'superadmin')
    or has_role(auth.uid(), 'guardia')
  );

create policy flagged_visitors_insert on flagged_visitors for insert to authenticated
  with check (
    has_role(auth.uid(), 'admin')
    or has_role(auth.uid(), 'recepcion')
    or has_role(auth.uid(), 'superadmin')
  );
