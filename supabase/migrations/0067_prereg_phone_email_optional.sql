-- Teléfono y correo del visitante pasan a opcionales en el pre-registro
-- público -- a pedido explícito del usuario. Este catálogo ya es
-- configurable desde Catálogos → Campos de pre-registro (ver 0055); esto
-- solo cambia el valor por default de esas dos filas existentes, un admin
-- puede volver a marcarlas obligatorias desde ahí en cualquier momento.
update preregistro_fields
set required = false
where field_key in ('visitorPhone', 'visitorEmail');
