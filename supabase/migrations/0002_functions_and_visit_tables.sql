create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from profiles where id = auth.uid()
$$;

create table visit_preregistrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  visitor_name text not null,
  visitor_company text,
  host_employee_id uuid references employees(id),
  reason text,
  visit_date date not null,
  visit_time time,
  status prereg_status not null default 'pendiente',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  folio text unique,
  preregistration_id uuid references visit_preregistrations(id),
  company_id uuid not null references companies(id),
  visitor_name text not null,
  visitor_company text,
  host_employee_id uuid references employees(id),
  reason text,
  visit_date date not null default current_date,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  visitor_photo_path text not null,
  id_photo_path text not null,
  status visit_status not null default 'dentro',
  created_by uuid references profiles(id) not null,
  created_at timestamptz not null default now()
);

-- Folio auto-generado y seguro ante inserciones concurrentes (reemplaza el
-- esquema viejo basado en getLastRow(), que se rompía si se borraba una fila).
create or replace function public.generate_visit_folio()
returns trigger language plpgsql as $$
declare
  v_seq int;
begin
  if new.folio is null or new.folio = '' then
    perform pg_advisory_xact_lock(hashtext('visits_folio_' || new.visit_date::text));
    select count(*) + 1 into v_seq from visits where visit_date = new.visit_date;
    new.folio := 'VIS-' || to_char(new.visit_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_generate_visit_folio
before insert on visits
for each row execute function public.generate_visit_folio();

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.log_audit(_action text, _entity text, _entity_id uuid, _detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(actor_id, action, entity, entity_id, detail)
  values (auth.uid(), _action, _entity, _entity_id, _detail);
end;
$$;

create or replace function public.audit_visits() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('create','visits', new.id, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    perform public.log_audit('update','visits', new.id, jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  end if;
  return new;
end;
$$;

create trigger trg_audit_visits after insert or update on visits for each row execute function public.audit_visits();

create or replace function public.audit_user_roles() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('grant_role','user_roles', new.user_id, to_jsonb(new));
  elsif tg_op = 'DELETE' then
    perform public.log_audit('revoke_role','user_roles', old.user_id, to_jsonb(old));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_user_roles after insert or delete on user_roles for each row execute function public.audit_user_roles();
