-- Para que el pre-registro público también pueda preguntar a cuál
-- instalación va (Envia.com / Fulfillment en Madrid, Local 3 / Envia.com en
-- Monterrey), igual que ya hace CheckIn.tsx al registrar en recepción.
-- Texto libre, como visits.facility -- no es un enum fijo, sale de
-- office_facilities según la oficina elegida.
alter table visit_preregistrations add column facility text;
