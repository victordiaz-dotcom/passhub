-- PassHub v2, paso 1: catálogo de oficinas para el scoping por oficina
-- (admin/recepción ven solo su oficina asignada; superadmin ve todas).
-- Lista inicial confirmada por el usuario: Cd. de México y Monterrey
-- (México), Colombia, España. Se pueden agregar más oficinas después
-- simplemente insertando filas nuevas.
create table offices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  country text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into offices (name, country) values
  ('Cd. de México', 'MX'),
  ('Monterrey', 'MX'),
  ('Colombia', 'CO'),
  ('España', 'ES');

alter table offices enable row level security;

-- Mismo patrón que el catálogo de empresas (companies_select/write):
-- cualquier usuario autenticado puede leer el catálogo; solo
-- admin/superadmin pueden darlo de alta o editarlo.
create policy offices_select on offices for select to authenticated using (true);
create policy offices_write on offices for all to authenticated
  using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
  with check (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

-- office_id en profiles: a qué oficina pertenece la cuenta (admin/recepción/
-- guardia). Nulo = superadmin (ve todas las oficinas) o cuenta aún sin
-- asignar — las políticas de scoping (paso 2) tratan null como "sin
-- restricción" solo para superadmin, nunca para los otros roles.
alter table profiles add column office_id uuid references offices(id);

-- office_id en employees: para filtrar el picker "Colaborador que recibe"
-- por oficina. Queda nulo para los registros existentes; se llenará en un
-- paso posterior cuando sync-employees capture "city" del directorio de
-- Slack y la mapee a oficina.
alter table employees add column office_id uuid references offices(id);
