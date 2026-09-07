-- Las divisiones (antes hardcodeadas en src/lib/divisions.ts, junto con el
-- nombre "Tendencys Innovations" para decidir cuándo mostrar el campo) pasan
-- a vivir en la base de datos: cada división pertenece a una empresa, y el
-- front decide si mostrar "División" según si esa empresa tiene alguna
-- división registrada aquí, no comparando un nombre hardcodeado.
create table divisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

alter table divisions enable row level security;

create policy divisions_select on divisions for select to authenticated using (true);
create policy divisions_write on divisions for all to authenticated using (
  has_role(auth.uid(), 'admin')
) with check (
  has_role(auth.uid(), 'admin')
);

-- Semilla: las mismas 6 divisiones que ya existían hardcodeadas, para
-- Tendencys Innovations (la única empresa que las usaba).
insert into divisions (company_id, name)
select id, division_name
from companies
cross join (values ('Envia'), ('Envia FF'), ('Envia Cargo'), ('Envia WMS'), ('Ecartapi'), ('Envia Partners')) as d(division_name)
where companies.name = 'Tendencys Innovations';
