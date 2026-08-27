-- Endurecimiento post-auditoría: search_path fijo + privilegios de ejecución mínimos.
alter function public.generate_visit_folio() set search_path = public;

revoke execute on function public.has_role(uuid, app_role) from public;
grant execute on function public.has_role(uuid, app_role) to authenticated;

revoke execute on function public.current_company_id() from public;
grant execute on function public.current_company_id() to authenticated;

revoke execute on function public.log_audit(text, text, uuid, jsonb) from public;

revoke execute on function public.audit_visits() from public;
revoke execute on function public.audit_user_roles() from public;
