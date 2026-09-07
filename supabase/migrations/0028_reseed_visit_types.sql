-- La tabla visit_types quedó vacía (las 4 filas sembradas en 0025 ya no
-- están), así que el selector de "Tipo de visita" solo mostraba "Otros".
-- Se vuelve a sembrar la lista original; on conflict do nothing por si
-- alguna ya existiera.
insert into visit_types (name) values
  ('Cliente'),
  ('Proveedor'),
  ('Partners'),
  ('Candidatos (entrevista)')
on conflict (name) do nothing;
