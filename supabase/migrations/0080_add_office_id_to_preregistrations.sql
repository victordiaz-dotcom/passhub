-- El pre-registro público ahora guarda a qué oficina va. Sin esto, un
-- pre-registro hecho desde España aparecía igual para la recepción de
-- Monterrey: no había forma de distinguirlos. El front lo resuelve solo con
-- la zona horaria del dispositivo (ver src/lib/detectCountry.ts) y la
-- función de borde lo valida contra esta tabla antes de guardarlo.
--
-- Nullable a propósito: los pre-registros que ya existen no tienen oficina y
-- deben seguir siendo válidos (se tratan como "sin oficina", mismo criterio
-- que office_id null en profiles/employees).
alter table visit_preregistrations add column office_id uuid references offices(id);
