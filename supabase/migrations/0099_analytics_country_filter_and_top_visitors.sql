-- Pedido del usuario: superadmin debe poder filtrar Analíticas por país
-- (México/España), y ver una gráfica nueva de "quiénes visitan más" ese
-- país -- un admin de un país ya solo ve su propio país por RLS
-- (visits_select/prereg_select), así que para él este parámetro es
-- irrelevante en la práctica (aunque lo mandara, RLS ya lo limita a sus
-- propias filas).
--
-- p_country se agrega como parámetro OPCIONAL (default null = sin filtro,
-- el comportamiento de siempre) al final de la firma de cada función --
-- CREATE OR REPLACE con una firma distinta (un parámetro más) crea una
-- función SOBRECARGADA nueva en vez de reemplazar la vieja, así que las 6
-- firmas de 2/3 parámetros de antes se borran primero explícitamente.
-- Todo el resto del cuerpo de cada función se copió tal cual estaba en
-- producción/dev (leído en vivo con pg_get_functiondef, no reconstruido de
-- memoria de migraciones viejas) -- en particular el ajuste de zona horaria
-- ('America/Monterrey') en mes/hora/día de la semana, y el cálculo dinámico
-- de "vencida" en pre-registros, que una versión reconstruida de memoria
-- había omitido.
--
-- Siguen siendo SECURITY INVOKER (sin cambiarlo): heredan RLS del que
-- llama, igual que ya documentó la migración 0092 -- este cambio solo
-- añade una restricción ADICIONAL por país encima de lo que RLS ya deja
-- ver, nunca la reemplaza. El join es contra offices vía office_id
-- (visits.office_id desde 0089, visit_preregistrations.office_id desde
-- 0080); una fila con office_id null nunca coincide con ningún país
-- filtrado (solo "Todos", p_country null, las sigue incluyendo).

drop function if exists analytics_visits_by_month(timestamptz, timestamptz);
drop function if exists analytics_top_visitor_companies(timestamptz, timestamptz, int);
drop function if exists analytics_top_hosts(timestamptz, timestamptz, int);
drop function if exists analytics_prereg_status_breakdown(timestamptz, timestamptz);
drop function if exists analytics_visits_by_hour(timestamptz, timestamptz);
drop function if exists analytics_visits_by_weekday(timestamptz, timestamptz);

create function analytics_visits_by_month(p_start timestamptz, p_end timestamptz, p_country text default null)
returns table(month_start date, visits_count bigint)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select date_trunc('month', v.check_in_at at time zone 'America/Monterrey')::date, count(*)
    from visits v
    left join offices o on o.id = v.office_id
    where v.check_in_at >= p_start and v.check_in_at < p_end
      and (p_country is null or o.country = p_country)
    group by 1
    order by 1;
end;
$$;

create function analytics_top_visitor_companies(
  p_start timestamptz, p_end timestamptz, p_limit int default 10, p_country text default null
)
returns table(visitor_company text, visits_count bigint)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select v.visitor_company, count(*)
    from visits v
    left join offices o on o.id = v.office_id
    where v.check_in_at >= p_start and v.check_in_at < p_end
      and v.visitor_company is not null and trim(v.visitor_company) <> ''
      and (p_country is null or o.country = p_country)
    group by 1
    order by 2 desc
    limit p_limit;
end;
$$;

create function analytics_top_hosts(
  p_start timestamptz, p_end timestamptz, p_limit int default 10, p_country text default null
)
returns table(employee_id uuid, full_name text, visits_count bigint)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select e.id, e.full_name, count(*)
    from visits v
    join employees e on e.id = v.host_employee_id
    left join offices o on o.id = v.office_id
    where v.check_in_at >= p_start and v.check_in_at < p_end
      and (p_country is null or o.country = p_country)
    group by e.id, e.full_name
    order by 3 desc
    limit p_limit;
end;
$$;

create function analytics_prereg_status_breakdown(p_start timestamptz, p_end timestamptz, p_country text default null)
returns table(status text, status_count bigint)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select bucket, count(*)
    from (
      select case
        when p.status = 'usada' then 'usada'
        when (now() at time zone 'America/Monterrey')::date
             > coalesce(p.extended_until, p.visit_date + 7) then 'vencida'
        else 'pendiente'
      end as bucket
      from visit_preregistrations p
      left join offices o on o.id = p.office_id
      where p.created_at >= p_start and p.created_at < p_end
        and p.status <> 'cancelada'
        and (p_country is null or o.country = p_country)
    ) sub
    group by bucket;
end;
$$;

create function analytics_visits_by_hour(p_start timestamptz, p_end timestamptz, p_country text default null)
returns table(hour_of_day int, visits_count bigint)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select extract(hour from v.check_in_at at time zone 'America/Monterrey')::int, count(*)
    from visits v
    left join offices o on o.id = v.office_id
    where v.check_in_at >= p_start and v.check_in_at < p_end
      and (p_country is null or o.country = p_country)
    group by 1
    order by 1;
end;
$$;

create function analytics_visits_by_weekday(p_start timestamptz, p_end timestamptz, p_country text default null)
returns table(weekday int, visits_count bigint)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select extract(dow from v.check_in_at at time zone 'America/Monterrey')::int, count(*)
    from visits v
    left join offices o on o.id = v.office_id
    where v.check_in_at >= p_start and v.check_in_at < p_end
      and (p_country is null or o.country = p_country)
    group by 1
    order by 1;
end;
$$;

revoke execute on function analytics_visits_by_month(timestamptz, timestamptz, text) from public;
revoke execute on function analytics_top_visitor_companies(timestamptz, timestamptz, int, text) from public;
revoke execute on function analytics_top_hosts(timestamptz, timestamptz, int, text) from public;
revoke execute on function analytics_prereg_status_breakdown(timestamptz, timestamptz, text) from public;
revoke execute on function analytics_visits_by_hour(timestamptz, timestamptz, text) from public;
revoke execute on function analytics_visits_by_weekday(timestamptz, timestamptz, text) from public;

grant execute on function analytics_visits_by_month(timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function analytics_top_visitor_companies(timestamptz, timestamptz, int, text) to authenticated, service_role;
grant execute on function analytics_top_hosts(timestamptz, timestamptz, int, text) to authenticated, service_role;
grant execute on function analytics_prereg_status_breakdown(timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function analytics_visits_by_hour(timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function analytics_visits_by_weekday(timestamptz, timestamptz, text) to authenticated, service_role;

-- Nueva: "quiénes visitan más" -- mismo criterio de normalización que ya
-- usa Historial.tsx (loadFrequency: trim + lowercase para agrupar, nombre
-- de despliegue tomado de la visita más antigua con esa forma normalizada,
-- igual que array_agg ... order by check_in_at asc lo resuelve aquí).
create function analytics_top_visitors(
  p_start timestamptz, p_end timestamptz, p_limit int default 10, p_country text default null
)
returns table (visitor_name text, visits_count bigint)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if not (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'superadmin')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
    select (array_agg(v.visitor_name order by v.check_in_at asc))[1], count(*)
    from visits v
    left join offices o on o.id = v.office_id
    where v.check_in_at >= p_start and v.check_in_at < p_end
      and (p_country is null or o.country = p_country)
    group by lower(trim(v.visitor_name))
    order by 2 desc
    limit p_limit;
end;
$$;

revoke execute on function analytics_top_visitors(timestamptz, timestamptz, int, text) from public;
grant execute on function analytics_top_visitors(timestamptz, timestamptz, int, text) to authenticated, service_role;
