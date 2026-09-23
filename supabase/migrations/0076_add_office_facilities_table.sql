-- Catálogo de instalaciones por oficina (ej. Monterrey: Local 3, Envia.com)
-- -- mismo patrón que divisions (scoped por company_id): admin/superadmin
-- pueden agregar/desactivar, cualquier autenticado puede leerlas. El campo
-- en Registrar visita solo aparece si la oficina del que registra tiene
-- filas aquí, igual que "División" aparece solo si la empresa tiene
-- divisiones.
create table office_facilities (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references offices(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (office_id, name)
);

alter table office_facilities enable row level security;

create policy office_facilities_select on office_facilities for select to authenticated using (true);
create policy office_facilities_write on office_facilities for all to authenticated
  using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
  with check (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

insert into office_facilities (office_id, name)
select id, 'Local 3' from offices where name = 'Monterrey'
union all
select id, 'Envia.com' from offices where name = 'Monterrey';
