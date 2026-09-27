// Nombres reales: cualquier letra Unicode (incluye ñ, acentos, y las
// variantes que algunos teclados/IMEs producen separando la letra base de su
// acento en un carácter combinante aparte, ej. "n" + U+0303) + espacio, guion,
// punto y apóstrofe recto/curvo (para "Ma. Guadalupe", "Jean-Pierre",
// "O'Brien"/"O’Brien" -- iOS/macOS convierten el apóstrofe recto al curvo
// solos). Se usa \p{L}\p{M} (Unicode) en vez de listar a mano las letras del
// español: una lista fija tarde o temprano rechaza un nombre real (de otro
// idioma, o un acento compuesto por el teclado de quien lo escribe).
const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.-]*$/u;
const MAX_NAME_LENGTH = 80;

export function isValidName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH && NAME_CHARS.test(trimmed);
}

export const NAME_INVALID_MESSAGE =
  "El nombre solo puede tener letras, espacios, guiones y apóstrofes (sin números ni símbolos).";
