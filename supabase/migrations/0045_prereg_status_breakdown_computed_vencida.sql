-- Tarea 1: "cancelada" nunca se escribe en ningún lado de la app (no existe
-- función para cancelar un pre-registro) — se excluye de la gráfica en vez
-- de mostrar una categoría que siempre está en cero.
-- Tarea 2: "vencida" tampoco se escribía nunca como status real; se calcula
-- al vuelo con el mismo criterio que ya usa la columna "Vigencia" de
-- Historial.tsx (extended_until, o si no hay, visit_date + 7 días), pero
-- solo para las filas que siguen en "pendiente" — "usada" siempre gana,
-- igual que en Historial (¿Usado? y Vigencia son cosas independientes ahí).
-- El tipo de retorno de "status" cambia de prereg_status a text porque ahora
-- es una etiqueta calculada, no el valor real de la columna — por eso hace
-- falta drop + create en vez de create or replace.

drop function if exists public.analytics_prereg_status_breakdown(timestamptz, timestamptz);

create function public.analytics_prereg_status_breakdown(p_start timestamptz, p_end timestamptz)
returns table(status text, status_count bigint)
language plpgsql
stable
set search_path = public
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
      where p.created_at >= p_start and p.created_at < p_end
        and p.status <> 'cancelada'
    ) sub
    group by bucket;
end;
$$;

revoke execute on function public.analytics_prereg_status_breakdown(timestamptz, timestamptz) from public, anon;
grant execute on function public.analytics_prereg_status_breakdown(timestamptz, timestamptz) to authenticated, service_role;
