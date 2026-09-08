-- Colores personalizados de las gráficas de Analíticas, por cuenta — antes
-- vivían en localStorage del navegador (ni compartido ni realmente ligado a
-- la cuenta: dependía de qué navegador/dispositivo, no de quién inició
-- sesión). Una fila por cuenta, con todos los colores en un solo jsonb.

create table analytics_chart_colors (
  user_id uuid primary key references profiles(id) on delete cascade,
  colors jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table analytics_chart_colors enable row level security;

-- Cada cuenta solo puede leer/crear/modificar/borrar su propia fila — es una
-- preferencia personal, ni siquiera superadmin puede ver/tocar la de otra
-- cuenta.
create policy analytics_chart_colors_own_row on analytics_chart_colors
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
