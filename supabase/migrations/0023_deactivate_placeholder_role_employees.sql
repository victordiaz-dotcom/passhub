-- Cuentas de puesto/rol genérico de Slack (sin nombre de persona, ej.
-- "Accounting Coordinator"), no colaboradores reales. Se desactivan (no se
-- borran) para que dejen de aparecer como opción en el front, sin perder
-- el registro por si algún día se necesita revisar.
update employees
set active = false
where full_name ~* '(coordinator|manager|administrator|director|specialist|assistant|supervisor|analyst|support|helpdesk|help desk|service desk|team|department|bot|system|admin|generic|shared|role|position|placeholder|test|sample|demo|noreply|no-reply|workflow|integration|automation)';
