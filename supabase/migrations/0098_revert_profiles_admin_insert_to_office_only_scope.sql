-- Revierte parte de 0097: confirmado con el usuario que la única
-- restricción real para gestionar cuentas es por oficina/país, no por
-- empresa -- varias empresas comparten una misma oficina física
-- (confirmado: las mismas empresas operan en Monterrey y en España), y
-- quien administra esa oficina debe poder crear/gestionar cuentas de
-- cualquiera de ellas. Mismo criterio que ahora comparten create-user,
-- reset-user-password y update-user-email (revertidos en el mismo commit
-- que esta migración): sin escape hatch de oficina cuando la del que llama
-- está asignada, y sin ninguna restricción de empresa.
alter policy profiles_admin_insert on profiles
  with check (
    has_role(auth.uid(), 'superadmin')
    or (
      has_role(auth.uid(), 'admin')
      and (my_office_id() is null or office_id = my_office_id())
    )
  );

-- my_company_id() ya no lo usa ninguna política -- se quita en vez de
-- dejarlo huérfano.
drop function if exists my_company_id();
