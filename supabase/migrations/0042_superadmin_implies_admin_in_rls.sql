-- Al preparar dejar la cuenta fundadora del sistema solo con el rol
-- superadmin (sin admin/recepcion adicionales), se encontró que casi
-- todas las políticas RLS gateadas por has_role(admin) [o admin/recepcion]
-- NUNCA incluían a superadmin como alternativa — a diferencia de las
-- Edge Functions, que sí
-- siempre chequean admin O superadmin. Una cuenta con SOLO el rol
-- superadmin no podría, por ejemplo, registrar una visita (visits_insert),
-- marcar salida (visits_update), ni gestionar colaboradores/empresas.
-- Esto alinea las políticas con el mismo criterio: superadmin siempre
-- incluye lo que puede hacer admin.

alter policy audit_logs_select on audit_logs
  using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy companies_write on companies
  using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
  with check (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy divisions_write on divisions
  using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
  with check (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy employees_delete on employees
  using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy employees_insert on employees
  with check (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy employees_update on employees
  using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
  with check (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy profiles_admin_insert on profiles
  with check (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy profiles_admin_update on profiles
  using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
  with check (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy profiles_select on profiles
  using (id = auth.uid() or has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy user_roles_select on user_roles
  using (user_id = auth.uid() or has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy prereg_insert on visit_preregistrations
  with check (
    has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin')
  );

alter policy prereg_select on visit_preregistrations
  using (
    has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin')
  );

alter policy prereg_update on visit_preregistrations
  using (
    has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin')
  )
  with check (
    has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin')
  );

alter policy visit_types_write on visit_types
  using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'))
  with check (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin'));

alter policy visits_insert on visits
  with check (
    has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin')
  );

alter policy visits_select on visits
  using (
    has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin')
  );

alter policy visits_update on visits
  using (
    has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin')
  )
  with check (
    has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'recepcion') or has_role(auth.uid(), 'superadmin')
  );
