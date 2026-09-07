-- Bug encontrado en tarea 3 de analíticas: analytics_visits_by_month,
-- analytics_visits_by_hour y analytics_visits_by_weekday agrupaban con
-- date_trunc/extract directamente sobre check_in_at (timestamptz), lo cual
-- Postgres evalúa en la zona horaria de la SESIÓN (UTC en este proyecto), no
-- en la hora local del negocio. Con UTC-6, cualquier check-in desde las
-- 6:00pm hora de Monterrey en adelante ya cae en el día/hora UTC siguiente,
-- corriendo por completo la gráfica de horarios pico y, en el borde de
-- medianoche, la de día de la semana y mes. Fix: convertir a
-- 'America/Monterrey' antes de extraer/truncar. analytics_top_visitor_companies,
-- analytics_top_hosts y analytics_prereg_status_breakdown no se tocan: solo
-- filtran por rango (p_start/p_end), no agrupan por un valor derivado de
-- fecha/hora.

create or replace function public.analytics_visits_by_month(p_start timestamptz, p_end timestamptz)
returns table(month_start date, visits_count bigint)
language plpgsql
stable
set search_path = public
as $$
begin
  if not has_role(auth.uid(), 'admin') then
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
  if not has_role(auth.uid(), 'admin') then
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
  if not has_role(auth.uid(), 'admin') then
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
