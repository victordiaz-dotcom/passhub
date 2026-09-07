-- Cuentas genéricas del directorio de Slack identificadas manualmente (IA,
-- puestos/roles departamentales, entornos de desarrollo) que no son
-- personas reales — se desactivan (no se borran) para que dejen de
-- aparecer en "Colaboradores" y en los selectores de "quién recibe". No se
-- detectan por un patrón de texto genérico (a diferencia de 0023): son
-- nombres específicos confirmados uno por uno.
update employees
set active = false
where lower(trim(full_name)) in (
  'ai alex', 'ai orion', 'ai sofia',
  'bdm br', 'bdm es', 'bdm in', 'bdm us',
  'cfo', 'cfo ecart',
  'claims mx',
  'consultant lawyer europe', 'consultant lawyer latam',
  'coo',
  'dev wms',
  'ff hr es',
  'financial planning',
  'fulfillment mty',
  'global partners',
  'gm cargo', 'gm ff',
  'growth tendencys',
  'hr latam'
);
