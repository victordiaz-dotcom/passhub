-- Rol beta de solo lectura para guardias de seguridad: solo pueden ver
-- quién está dentro en este momento, nada más (ni historial, ni editar).
alter type app_role add value 'guardia';
