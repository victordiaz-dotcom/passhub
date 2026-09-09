-- Registra en audit_logs quién agregó/desactivó una empresa, división o
-- tipo de visita, y cuándo — mismo patrón que ya usan
-- trg_audit_user_roles/trg_audit_visits (trigger SECURITY DEFINER, no
-- necesita que se le otorgue EXECUTE a authenticated sobre log_audit).
create or replace function public.audit_catalog_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('create', tg_table_name, new.id, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    perform public.log_audit('update', tg_table_name, new.id, jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_companies
  after insert or update on companies
  for each row execute function audit_catalog_change();

create trigger trg_audit_divisions
  after insert or update on divisions
  for each row execute function audit_catalog_change();

create trigger trg_audit_visit_types
  after insert or update on visit_types
  for each row execute function audit_catalog_change();
