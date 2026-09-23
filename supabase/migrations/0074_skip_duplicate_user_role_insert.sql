-- Segunda parte del hotfix sin frontend (ver migración 0072): con el
-- DELETE de la propia fila admin/superadmin ya bloqueado por RLS, ese
-- DELETE ahora no borra nada (0 filas, sin error) en vez de fallar -- pero
-- el código viejo de Users.tsx sigue intentando el INSERT de ese mismo rol
-- justo después, y como la fila nunca se borró, ese INSERT choca contra la
-- llave primaria (user_id, role) y sigue mostrando "No se pudo actualizar
-- el rol." aunque el nombre sí se haya guardado bien.
--
-- Un intento de insertar un (user_id, role) que YA existe siempre fue,
-- lógicamente, un no-op -- nunca debería tronar la operación completa. Se
-- absorbe aquí con un trigger BEFORE INSERT que descarta la fila (return
-- null) en vez de dejar que truene el unique violation, sin afectar
-- ningún INSERT real de un rol nuevo. Probado directamente: un INSERT
-- duplicado ya no da error y no crea una fila repetida.
create or replace function public.skip_duplicate_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from user_roles where user_id = new.user_id and role = new.role
  ) then
    return null;
  end if;
  return new;
end;
$$;

create trigger trg_skip_duplicate_user_role
before insert on user_roles
for each row execute function public.skip_duplicate_user_role();

revoke execute on function public.skip_duplicate_user_role() from public, anon, authenticated;
