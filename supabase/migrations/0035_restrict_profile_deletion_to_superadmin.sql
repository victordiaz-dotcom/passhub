-- profiles_admin_all cubría SELECT/INSERT/UPDATE/DELETE en una sola policy
-- "for all" con qual = has_role(auth.uid(),'admin') — sin distinguir
-- admin de super_admin, así que cualquier admin podía borrar cualquier
-- cuenta (incluida otra cuenta admin) directamente vía API, sin pasar por
-- el frontend. La única razón por la que esto no se notaba es un efecto
-- colateral: user_roles tiene ON DELETE CASCADE hacia profiles, y
-- user_roles_write ya exige super_admin para tocar filas con rol
-- admin/superadmin — pero eso es incidental, no una regla deliberada, y no
-- protege cuentas recepcion/guardia sin historial todavía.
--
-- Se separa en 3 policies explícitas: INSERT/UPDATE siguen siendo de admin
-- (sin cambio de comportamiento — Users.tsx ya las usa así), y DELETE queda
-- exclusivo de super_admin. Se excluye además el auto-borrado (ni siquiera
-- super_admin puede eliminarse a sí mismo), mismo criterio ya usado para
-- auto-desactivación en el frontend.
drop policy profiles_admin_all on profiles;

create policy profiles_admin_insert on profiles for insert to authenticated
with check (has_role(auth.uid(), 'admin'));

create policy profiles_admin_update on profiles for update to authenticated
using (has_role(auth.uid(), 'admin'))
with check (has_role(auth.uid(), 'admin'));

create policy profiles_delete on profiles for delete to authenticated
using (has_role(auth.uid(), 'superadmin') and id <> auth.uid());
