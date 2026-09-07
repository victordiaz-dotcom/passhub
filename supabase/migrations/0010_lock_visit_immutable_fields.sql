-- visits_update permite a recepción (y admin) reescribir CUALQUIER campo de
-- una visita de su empresa vía la API directa (no solo lo que la UI expone) —
-- eso rompe el rastro de auditoría (folio, fotos, quién y cuándo hizo el
-- check-in) y permite atribuir un check-out a un perfil ajeno. La app real
-- solo necesita mutar check_out_at/status/checked_out_by tras el insert;
-- todo lo demás se bloquea aquí sin tronar el UPDATE (se descarta en
-- silencio), y checked_out_by solo puede apuntar a quien hace la llamada.
create or replace function public.lock_visit_immutable_fields()
returns trigger language plpgsql as $$
begin
  new.folio := old.folio;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.check_in_at := old.check_in_at;
  new.company_id := old.company_id;
  new.preregistration_id := old.preregistration_id;
  new.visitor_photo_path := old.visitor_photo_path;
  new.id_photo_path := old.id_photo_path;
  new.visitor_name := old.visitor_name;
  new.visitor_company := old.visitor_company;
  new.host_employee_id := old.host_employee_id;
  new.reason := old.reason;
  new.division := old.division;
  new.visit_date := old.visit_date;

  if new.checked_out_by is distinct from old.checked_out_by
     and new.checked_out_by is distinct from auth.uid() then
    raise exception 'checked_out_by debe ser el usuario autenticado que hace la llamada';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lock_visit_immutable_fields on visits;
create trigger trg_lock_visit_immutable_fields
before update on visits
for each row execute function public.lock_visit_immutable_fields();
