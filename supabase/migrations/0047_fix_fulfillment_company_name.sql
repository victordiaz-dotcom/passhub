-- Corrección de ortografía en el nombre de la empresa (dato, no lógica):
-- "FulFillment" -> "Fulfillment".
update companies set name = 'Fulfillment' where name = 'FulFillment';
