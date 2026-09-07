-- Permite a un admin extender manualmente la vigencia de reingreso de un
-- pre-registro más allá de los 7 días por defecto (visit_date + 7). Si
-- extended_until tiene valor, sustituye ese cálculo por defecto en vez de
-- sumarse a él, así el admin decide la fecha final exacta.
alter table visit_preregistrations add column extended_until date;

-- prereg_update ya permite a admin y recepción actualizar cualquier fila
-- (lo necesitan para marcar status/used_at al hacer check-in), pero
-- extended_until solo debe poder cambiarlo un admin: se bloquea aquí en vez
-- de confiar solo en que la UI no le muestre el control a recepción.
create or replace function public.restrict_prereg_extension_to_admin()
returns trigger language plpgsql as $$
begin
  if new.extended_until is distinct from old.extended_until
     and not has_role(auth.uid(), 'admin') then
    raise exception 'Solo un administrador puede extender la vigencia de un pre-registro';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restrict_prereg_extension_to_admin on visit_preregistrations;
create trigger trg_restrict_prereg_extension_to_admin
before update on visit_preregistrations
for each row execute function public.restrict_prereg_extension_to_admin();
