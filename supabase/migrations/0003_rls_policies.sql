alter table companies enable row level security;
alter table employees enable row level security;
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table visit_preregistrations enable row level security;
alter table visits enable row level security;
alter table audit_logs enable row level security;

create policy companies_select on companies for select to authenticated using (true);
create policy companies_write on companies for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy employees_select on employees for select to authenticated using (
  public.has_role(auth.uid(),'admin') or company_id = public.current_company_id()
);
create policy employees_insert on employees for insert to authenticated with check (public.has_role(auth.uid(),'admin'));
create policy employees_update on employees for update to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy employees_delete on employees for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create policy profiles_select on profiles for select to authenticated using (
  id = auth.uid() or public.has_role(auth.uid(),'admin')
);
create policy profiles_update_self on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on profiles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy user_roles_select on user_roles for select to authenticated using (
  user_id = auth.uid() or public.has_role(auth.uid(),'admin')
);
create policy user_roles_admin_write on user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy prereg_select on visit_preregistrations for select to authenticated using (
  public.has_role(auth.uid(),'admin') or company_id = public.current_company_id()
);
create policy prereg_insert on visit_preregistrations for insert to authenticated with check (
  public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'recepcion') and company_id = public.current_company_id())
);
create policy prereg_update on visit_preregistrations for update to authenticated using (
  public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'recepcion') and company_id = public.current_company_id())
) with check (
  public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'recepcion') and company_id = public.current_company_id())
);

create policy visits_select on visits for select to authenticated using (
  public.has_role(auth.uid(),'admin') or company_id = public.current_company_id()
);
create policy visits_insert on visits for insert to authenticated with check (
  public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'recepcion') and company_id = public.current_company_id())
);
create policy visits_update on visits for update to authenticated using (
  public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'recepcion') and company_id = public.current_company_id())
) with check (
  public.has_role(auth.uid(),'admin') or (public.has_role(auth.uid(),'recepcion') and company_id = public.current_company_id())
);

create policy audit_logs_select on audit_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));
