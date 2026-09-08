-- Batch de correcciones de la auditoría de seguridad (hallazgos Medio/Bajo
-- que no requieren conocer el dominio de producción, a diferencia de CORS).

-- 1. Las 6 funciones de analíticas ya exigen has_role(admin) internamente
--    (no explotable hoy), pero además tenían EXECUTE otorgado a `anon` por
--    default de Postgres al crearlas — la migración 0030 solo revocó de
--    PUBLIC, no de anon explícitamente. Se cierra esa capa de defensa.
revoke execute on function public.analytics_visits_by_month(timestamptz, timestamptz) from anon;
revoke execute on function public.analytics_top_visitor_companies(timestamptz, timestamptz, integer) from anon;
revoke execute on function public.analytics_top_hosts(timestamptz, timestamptz, integer) from anon;
revoke execute on function public.analytics_prereg_status_breakdown(timestamptz, timestamptz) from anon;
revoke execute on function public.analytics_visits_by_hour(timestamptz, timestamptz) from anon;
revoke execute on function public.analytics_visits_by_weekday(timestamptz, timestamptz) from anon;

-- 2. current_company_id(): SECURITY DEFINER invocable por cualquier
--    authenticated, confirmado sin ningún uso (ni en frontend, ni en otras
--    funciones/policies vía pg_depend). Se elimina para reducir superficie
--    SECURITY DEFINER en vez de dejar código muerto expuesto.
drop function if exists public.current_company_id();

-- 3. Bucket visit-photos (fotos de identificación/rostro de visitantes) sin
--    límite de tamaño ni de tipo MIME — cualquier cuenta con permiso de
--    INSERT (admin/recepción) podía subir un archivo arbitrariamente grande
--    o de cualquier tipo. Se acota a imágenes, hasta 10MB.
update storage.buckets
set file_size_limit = 10485760, -- 10MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'visit-photos';

-- 4. Tabla de rate limiting para los 2 Edge Functions públicos sin auth
--    (resolve-username, public-preregister) — sin esto, ninguno tenía
--    ninguna protección contra flood/fuerza bruta. Solo el service role la
--    usa (las Edge Functions), por eso RLS habilitado sin ninguna policy:
--    deniega todo a anon/authenticated por default, service_role la salta.
create table if not exists public.edge_rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);
create index if not exists edge_rate_limits_lookup_idx on public.edge_rate_limits (bucket, identifier, created_at);
alter table public.edge_rate_limits enable row level security;
