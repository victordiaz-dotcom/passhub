-- Un admin normal puede seguir creando/editando cuentas de recepción, pero
-- otorgar o quitar el rol admin/superadmin queda reservado a superadmin —
-- así un admin no puede ascenderse a sí mismo ni repartir ese poder sin
-- control. Se aplica tanto a INSERT/UPDATE (with_check) como a DELETE/UPDATE
-- de filas existentes (using), porque el flujo de "cambiar rol" en el front
-- borra la fila vieja y luego inserta la nueva.
drop policy user_roles_admin_write on user_roles;

create policy user_roles_write on user_roles for all to authenticated
using (
  case
    when role in ('admin', 'superadmin') then has_role(auth.uid(), 'superadmin')
    else has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')
  end
)
with check (
  case
    when role in ('admin', 'superadmin') then has_role(auth.uid(), 'superadmin')
    else has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')
  end
);

-- user_roles_select ya deja ver su propia fila o todo si es admin; con
-- superadmin basta con que también cuente como admin para el resto de la
-- app (visitas, empleados, historial, etc.), así que se le asignan ambos
-- roles en vez de reescribir cada policy/chequeo de has_role('admin') que
-- ya existe en el resto del sistema.
insert into user_roles (user_id, role)
select id, 'superadmin'::app_role from profiles where email = 'victor.diaz@tendencys.com'
on conflict do nothing;
