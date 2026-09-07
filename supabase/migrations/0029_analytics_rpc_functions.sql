-- Sección de analíticas del Panel de control: 6 funciones que agregan en
-- Postgres (no se traen filas crudas al cliente). Cada una está restringida
-- a admin/superadmin (has_role ya considera que superadmin siempre también
-- tiene el rol admin) — recepción y guardia sí pueden leer visits/
-- visit_preregistrations por RLS para su trabajo operativo, pero analíticas
-- es una vista distinta con su propia autorización, no derivada de esa RLS.

create or replace function analytics_visits_by_month(p_start timestamptz, p_end timestamptz)
returns table (month_start date, visits_count bigint)
language plpgsql
stable
as $$
begin
  if not has_role(auth.uid(), 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select date_trunc('month', v.check_in_at)::date, count(*)
    from visits v
    where v.check_in_at >= p_start and v.check_in_at < p_end
    group by 1
    order by 1;
end;
$$;

create or replace function analytics_top_visitor_companies(
  p_start timestamptz, p_end timestamptz, p_limit int default 10
)
returns table (visitor_company text, visits_count bigint)
language plpgsql
stable
as $$
begin
  if not has_role(auth.uid(), 'admin') then
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

create or replace function analytics_top_hosts(
  p_start timestamptz, p_end timestamptz, p_limit int default 10
)
returns table (employee_id uuid, full_name text, visits_count bigint)
language plpgsql
stable
as $$
begin
  if not has_role(auth.uid(), 'admin') then
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

create or replace function analytics_prereg_status_breakdown(p_start timestamptz, p_end timestamptz)
returns table (status prereg_status, status_count bigint)
language plpgsql
stable
as $$
begin
  if not has_role(auth.uid(), 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select p.status, count(*)
    from visit_preregistrations p
    where p.created_at >= p_start and p.created_at < p_end
    group by p.status;
end;
$$;

create or replace function analytics_visits_by_hour(p_start timestamptz, p_end timestamptz)
returns table (hour_of_day int, visits_count bigint)
language plpgsql
stable
as $$
begin
  if not has_role(auth.uid(), 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select extract(hour from v.check_in_at)::int, count(*)
    from visits v
    where v.check_in_at >= p_start and v.check_in_at < p_end
    group by 1
    order by 1;
end;
$$;

create or replace function analytics_visits_by_weekday(p_start timestamptz, p_end timestamptz)
returns table (weekday int, visits_count bigint)
language plpgsql
stable
as $$
begin
  if not has_role(auth.uid(), 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select extract(dow from v.check_in_at)::int, count(*)
    from visits v
    where v.check_in_at >= p_start and v.check_in_at < p_end
    group by 1
    order by 1;
end;
$$;
