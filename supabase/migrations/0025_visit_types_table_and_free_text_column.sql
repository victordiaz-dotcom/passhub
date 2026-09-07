-- "Tipo de visita" deja de ser un enum fijo de 2 valores: ahora es texto
-- libre, con una lista sugerida administrable (visit_types) que alimenta el
-- selector en el front. La opción "Otros" del front no vive aquí — es un
-- valor libre que la persona escribe, no una fila de esta tabla.
create table visit_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

alter table visit_types enable row level security;

create policy visit_types_select on visit_types for select to authenticated using (true);
create policy visit_types_write on visit_types for all to authenticated using (
  has_role(auth.uid(), 'admin')
) with check (
  has_role(auth.uid(), 'admin')
);

insert into visit_types (name) values ('Cliente'), ('Proveedor'), ('Partners'), ('Candidatos (entrevista)');

-- Las columnas existentes eran del enum visit_type ('colaborador'/'cliente');
-- se migran a texto libre preservando el valor actual, y se retira el enum.
alter table visits alter column visit_type type text using visit_type::text;
alter table visit_preregistrations alter column visit_type type text using visit_type::text;
drop type visit_type;

-- Los valores viejos ('colaborador'/'cliente') ya no calzan con la lista
-- nueva; se re-etiquetan a algo razonable de la lista sugerida para no dejar
-- historial con un valor huérfano.
update visits set visit_type = 'Cliente' where visit_type in ('cliente', 'colaborador');
update visit_preregistrations set visit_type = 'Cliente' where visit_type in ('cliente', 'colaborador');
