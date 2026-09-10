-- Panel de admin para configurar los campos del pre-registro público:
-- mostrar/ocultar y marcar obligatorios los campos existentes, reordenar,
-- y agregar campos de texto libre nuevos (label ES/EN + obligatorio).
-- "builtin" son los campos que ya existen en el formulario (identificados
-- por field_key fijo); "custom" son los que el admin agrega desde el
-- panel. visitorName, la empresa que visitas, y fecha/hora de visita NO
-- son configurables aquí (son estructurales al pre-registro), igual que
-- "división" (ya es condicional según la empresa elegida).
create table preregistro_fields (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('builtin','custom')),
  field_key text not null unique,
  visible boolean not null default true,
  required boolean not null default false,
  sort_order integer not null default 0,
  label_es text,
  label_en text,
  created_at timestamptz not null default now()
);

alter table preregistro_fields enable row level security;

create policy preregistro_fields_select on preregistro_fields for select to authenticated using (true);
create policy preregistro_fields_write on preregistro_fields for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'superadmin'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'superadmin'));

-- Respuestas a los campos "custom" de un pre-registro puntual. Se guarda
-- {[field_key]: {label_es, label_en, value}} -- la etiqueta se congela al
-- momento de enviar el formulario, para que si luego el admin renombra o
-- borra el campo, el pre-registro ya enviado siga mostrando con qué
-- etiqueta se le pidió el dato originalmente.
alter table visit_preregistrations add column custom_answers jsonb;

insert into preregistro_fields (kind, field_key, visible, required, sort_order) values
  ('builtin','visitorCompany', true, true, 10),
  ('builtin','visitorPhone', true, true, 20),
  ('builtin','visitorEmail', true, true, 30),
  ('builtin','visitType', true, true, 50),
  ('builtin','hasVehicle', true, true, 70),
  ('builtin','reason', true, true, 90);

-- audit_catalog_change() (migración 0052) ya es genérica (usa
-- tg_table_name/to_jsonb) -- se extiende para cubrir DELETE también
-- (los campos "custom" se pueden borrar desde el panel, a diferencia de
-- companies/divisions/visit_types que solo se desactivan).
create or replace function public.audit_catalog_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('create', tg_table_name, new.id, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    perform public.log_audit('update', tg_table_name, new.id, jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  elsif tg_op = 'DELETE' then
    perform public.log_audit('delete', tg_table_name, old.id, to_jsonb(old));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_preregistro_fields
  after insert or update or delete on preregistro_fields
  for each row execute function audit_catalog_change();
