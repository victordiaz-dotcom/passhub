-- sync-employees ahora solo trae/mantiene personal con country = 'MX'
-- (ver función). Esto desactiva de una vez a quienes ya se habían
-- sincronizado antes de ese cambio con un país confirmado distinto de
-- México, para que dejen de aparecer en cualquier selector que filtre por
-- "active" (check-in, pre-registro), no solo en Colaboradores. No se
-- tocan las filas con country nulo (país aún no resuelto por el
-- directorio), para no desactivar por error a alguien que sí sea de
-- México.
update employees
set active = false
where country is not null and country <> 'MX' and active = true;
