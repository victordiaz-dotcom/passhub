// Filtros "en vivo" para campos de texto: se aplican en cada onChange y
// quitan el carácter que no debía escribirse, en vez de solo avisar hasta
// enviar el formulario -- así no se puede ni teclear (ni pegar) un número o
// símbolo en un campo de nombre, en vez de solo rechazarse al final.

// Mismo criterio de caracteres que NAME_CHARS en nameValidation.ts (letras
// Unicode + marcas combinantes, espacio, guion, punto, apóstrofe recto/
// curvo) pero SIN el ancla de "debe empezar con letra": aquí se filtra
// carácter por carácter mientras se escribe, así que a media palabra el
// valor puede empezar con un espacio temporalmente sin que eso sea un
// problema (isValidName sigue validando la forma final al enviar).
const NAME_ALLOWED_CHARS = /[^\p{L}\p{M}\s'’.-]/gu;
export function filterNameInput(value: string): string {
  return value.replace(NAME_ALLOWED_CHARS, "");
}

// Teléfono: solo dígitos, máximo 10 -- cubre el número nacional mexicano
// (10 dígitos). Deliberadamente un tope (no una longitud fija exigida):
// España usa 9 dígitos y este mismo formulario lo usa tanto en Monterrey
// como en Madrid, así que exigir exactamente 10 rechazaría un teléfono
// español real. 10 dígitos alcanza para ambos sin bloquear ninguno.
const MAX_PHONE_DIGITS = 10;
export function filterPhoneInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, MAX_PHONE_DIGITS);
}

// Correo: mientras se escribe, solo se permiten los caracteres que de
// verdad pueden aparecer en un correo real (letras, dígitos, y . _ % + - @)
// -- bloquea comillas, gato, espacios y demás que un correo real nunca
// tiene, sin usar todavía el formato completo (que solo tiene sentido
// validar cuando ya se terminó de escribir, ver isValidEmailFormat).
const EMAIL_ALLOWED_CHARS = /[^A-Za-z0-9._%+@-]/g;
export function filterEmailInput(value: string): string {
  return value.replace(EMAIL_ALLOWED_CHARS, "");
}

const EMAIL_FORMAT = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export function isValidEmailFormat(value: string): boolean {
  return EMAIL_FORMAT.test(value.trim());
}

// Usuario (login): minúsculas, dígitos, punto, guion y guion bajo -- el
// mismo charset que ya se usaba implícitamente (Users.tsx ya forzaba
// minúsculas), ahora también bloqueando espacios/acentos/símbolos mientras
// se escribe, en vez de dejarlos pasar hasta el envío.
const USERNAME_ALLOWED_CHARS = /[^a-z0-9._-]/g;
export function filterUsernameInput(value: string): string {
  return value.toLowerCase().replace(USERNAME_ALLOWED_CHARS, "");
}

export const EMAIL_INVALID_MESSAGE = "Escribe un correo electrónico válido.";
export const PHONE_INVALID_MESSAGE = "El teléfono debe tener máximo 10 dígitos.";
export const USERNAME_INVALID_MESSAGE = "El usuario solo puede tener minúsculas, números, puntos y guiones.";
