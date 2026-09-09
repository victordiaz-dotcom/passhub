-- El directorio de Slack (slack_users, ver sync-employees) ya trae un
-- campo "country" (código ISO de 2 letras, ej. 'MX', 'AR') que hasta ahora
-- no se guardaba. Se agrega para poder filtrar Colaboradores solo a
-- personal de México, aparte del filtro de bots/placeholders/activos que
-- ya existía.
alter table employees add column country text;
