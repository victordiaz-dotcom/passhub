-- Login por usuario (además de correo): se agrega un username propio,
-- separado del correo real de la persona, que sigue guardándose igual.
alter table profiles add column username text;

-- Backfill para las cuentas ya existentes: se deriva del correo (antes del
-- @) como valor inicial razonable; un admin puede cambiarlo después.
update profiles set username = lower(split_part(email, '@', 1)) where username is null;

alter table profiles alter column username set not null;

-- Único sin distinguir mayúsculas/minúsculas, para que "Juan.Perez" y
-- "juan.perez" no puedan coexistir como usuarios distintos.
create unique index profiles_username_lower_idx on profiles (lower(username));
