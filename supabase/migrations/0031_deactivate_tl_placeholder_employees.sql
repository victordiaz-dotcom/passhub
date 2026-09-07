-- Otra tanda de cuentas genéricas de Slack: puestos "TL <equipo>" (Team
-- Lead de un equipo/región), no personas reales. Mismo tratamiento que 0023/
-- 0027: se desactivan (no se borran), verificado que no tienen referencias
-- en visits/visit_preregistrations.
update employees
set active = false
where lower(trim(full_name)) in (
  'tl collection', 'tl cs cdmx', 'tl cs fr', 'tl cs in', 'tl cs it', 'tl css mx',
  'tl ftl operations', 'tl it qa', 'tl kae', 'tl kae br', 'tl kae cdmx', 'tl kae es', 'tl kae us',
  'tl mdr fr', 'tl mdr in', 'tl mdr it', 'tl mdr us', 'tl qa cs',
  'tl sdr cdmx', 'tl sdr co', 'tl sdr in', 'tl sdr it', 'tl sdr us'
);
