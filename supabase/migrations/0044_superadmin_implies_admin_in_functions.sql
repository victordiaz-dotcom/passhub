-- Mismo bug que la migración 0042, pero en el CUERPO de las funciones (no
-- en policies de pg_policies, por eso no se detectó en esa auditoría): las
-- 6 funciones de analíticas y restrict_prereg_extension_to_admin exigían
-- has_role(auth.uid(), 'admin') a secas, sin aceptar superadmin como
-- alternativa. Una cuenta con SOLO el rol superadmin (como la fundadora
-- del sistema) no podía cargar ninguna gráfica de Analíticas, ni extender la
-- vigencia de un pre-registro.

create or replace function public.analytics_visits_by_month(p_start timestamptz, p_end timestamptz)
returns table(month_start date, visits_count bigint)
language plpgsql
stable
set search_path = public
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select date_trunc('month', v.check_in_at at time zone 'America/Monterrey')::date, count(*)
    from visits v
    where v.check_in_at >= p_start and v.check_in_at < p_end
    group by 1
    order by 1;
end;
$$;

create or replace function public.analytics_visits_by_hour(p_start timestamptz, p_end timestamptz)
returns table(hour_of_day int, visits_count bigint)
language plpgsql
stable
set search_path = public
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select extract(hour from v.check_in_at at time zone 'America/Monterrey')::int, count(*)
    from visits v
    where v.check_in_at >= p_start and v.check_in_at < p_end
    group by 1
    order by 1;
end;
$$;

create or replace function public.analytics_visits_by_weekday(p_start timestamptz, p_end timestamptz)
returns table(weekday int, visits_count bigint)
language plpgsql
stable
set search_path = public
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select extract(dow from v.check_in_at at time zone 'America/Monterrey')::int, count(*)
    from visits v
    where v.check_in_at >= p_start and v.check_in_at < p_end
    group by 1
    order by 1;
end;
$$;

create or replace function public.analytics_top_visitor_companies(p_start timestamptz, p_end timestamptz, p_limit int default 10)
returns table(visitor_company text, visits_count bigint)
language plpgsql
stable
set search_path = public
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select v.visitor_company, count(*)
    from visits v
    where v.check_in_at >= p_start and v.check_in_at < p_end
      and v.visitor_company is not null and trim(v.visitor_company) <> ''
    group by 1
    order by 2 desc
    limit p_limit;
end;
$$;

create or replace function public.analytics_top_hosts(p_start timestamptz, p_end timestamptz, p_limit int default 10)
returns table(employee_id uuid, full_name text, visits_count bigint)
language plpgsql
stable
set search_path = public
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select e.id, e.full_name, count(*)
    from visits v
    join employees e on e.id = v.host_employee_id
    where v.check_in_at >= p_start and v.check_in_at < p_end
    group by e.id, e.full_name
    order by 3 desc
    limit p_limit;
end;
$$;

create or replace function public.analytics_prereg_status_breakdown(p_start timestamptz, p_end timestamptz)
returns table(status prereg_status, status_count bigint)
language plpgsql
stable
set search_path = public
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select p.status, count(*)
    from visit_preregistrations p
    where p.created_at >= p_start and p.created_at < p_end
    group by p.status;
end;
$$;

create or replace function public.restrict_prereg_extension_to_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.extended_until is distinct from old.extended_until
     and not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'Solo un administrador puede extender la vigencia de un pre-registro';
  end if;

  return new;
end;
$$;
