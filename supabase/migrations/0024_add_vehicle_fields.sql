-- ¿Trae vehículo? y sus datos (placas, color, modelo), capturados en el
-- pre-registro público y conservados hasta la visita real si ese
-- pre-registro se usa para entrar (para no perder el dato al escanear el QR).
alter table visit_preregistrations add column has_vehicle boolean;
alter table visit_preregistrations add column vehicle_plate text;
alter table visit_preregistrations add column vehicle_color text;
alter table visit_preregistrations add column vehicle_model text;

alter table visits add column has_vehicle boolean;
alter table visits add column vehicle_plate text;
alter table visits add column vehicle_color text;
alter table visits add column vehicle_model text;
