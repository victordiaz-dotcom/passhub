-- Hotfix de producción, aplicado sin necesidad de un nuevo despliegue de
-- frontend (el bug real -- Users.tsx borrando TODOS los roles antes de
-- volver a insertar -- ya está corregido en el código, pendiente de una
-- nueva imagen de Docker; mientras el sitio en vivo siga corriendo el
-- código viejo, este cambio evita el daño real).
--
-- Si un super admin se editaba a sí mismo (ej. solo el nombre), el código
-- viejo borraba primero su propia fila de admin/superadmin en user_roles,
-- y como esta misma policy exige has_role(auth.uid(),'superadmin') para
-- tocar filas de ese nivel, el DELETE se quitaba a sí mismo la
-- autorización que necesitaba el INSERT siguiente -- dejando la cuenta sin
-- ningún rol (le pasó dos veces el 2026-09-23 a victor.diaz@tendencys.com,
-- restaurado manualmente ambas veces).
--
-- Se agrega "and user_id <> auth.uid()" SOLO al USING (lo único que
-- Postgres evalúa para DELETE; INSERT solo mira WITH CHECK, que se deja
-- intacto) -- mismo patrón ya usado en profiles_delete (migración 0035:
-- "ni siquiera super_admin puede eliminarse a sí mismo"). Con esto, borrar
-- tu propia fila de rol admin/superadmin queda bloqueado sin importar qué
-- versión del frontend esté corriendo: el DELETE falla limpio (el código
-- revisa el error y se detiene antes de intentar el INSERT), en vez de
-- dejar la cuenta sin rol.
alter policy user_roles_write on user_roles
  using (
    case
      when role in ('admin','superadmin') then has_role(auth.uid(),'superadmin') and user_id <> auth.uid()
      else has_role(auth.uid(),'admin') or has_role(auth.uid(),'superadmin')
    end
  )
  with check (
    case
      when role in ('admin','superadmin') then has_role(auth.uid(),'superadmin')
      else has_role(auth.uid(),'admin') or has_role(auth.uid(),'superadmin')
    end
  );
