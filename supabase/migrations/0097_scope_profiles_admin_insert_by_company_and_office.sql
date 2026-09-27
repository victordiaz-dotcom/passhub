-- profiles_admin_insert (política de INSERT directo por REST, no la Edge
-- Function create-user) solo comprobaba el rol -- nunca el company_id ni el
-- office_id de la fila nueva. Hallazgo de la revisión: esto dejaba a
-- cualquier admin no-superadmin crear un perfil con company_id null (o de
-- OTRA empresa) directo por PostgREST, saltándose por completo la
-- obligatoriedad de companyId que sí exige create-user -- y con company_id
-- null + una oficina compartida entre varias empresas (confirmado: las
-- mismas empresas operan en Monterrey y en España), eso reabría exactamente
-- la fuga entre empresas que ya se cerró en
-- create-user/reset-user-password/update-user-email.
--
-- create-user (la Edge Function real) usa la service role, que ignora RLS
-- por completo -- esta política solo afecta un insert directo con el JWT
-- del propio admin, algo que el frontend nunca hace hoy (confirmado por
-- grep), así que este cambio no le quita ninguna capacidad legítima a nadie.
create function my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from profiles where id = auth.uid()
$$;

-- Mismo criterio que my_office_id(): anon no debe poder invocar funciones
-- SECURITY DEFINER que leen `profiles`.
revoke execute on function public.my_company_id() from anon;

-- company_id se exige SIEMPRE para un admin no-superadmin (sin escape hatch
-- si el suyo es null -- si un admin no tiene empresa asignada, no puede
-- crear ningún perfil hasta que se le asigne una). office_id mantiene el
-- criterio ya usado en create-user: null en la propia oficina del admin =
-- sin restricción de oficina.
alter policy profiles_admin_insert on profiles
  with check (
    has_role(auth.uid(), 'superadmin')
    or (
      has_role(auth.uid(), 'admin')
      and company_id = my_company_id()
      and (my_office_id() is null or office_id = my_office_id())
    )
  );
