// Detecta el país del visitante desde su propio dispositivo, para
// preseleccionar la oficina en el link público de pre-registro SIN tener que
// repartir un link distinto por país (/es, /mx). Es una SUGERENCIA, no una
// decisión: quien llena el formulario siempre ve qué oficina quedó elegida y
// puede cambiarla. Detectar mal y mandar a la persona a la recepción
// equivocada en silencio sería peor que preguntar.
//
// Señales, en orden de confianza:
//   1. Zona horaria IANA del dispositivo (la más precisa y la que no
//      depende del idioma en que tenga configurado el teléfono).
//   2. Región del idioma del navegador (es-MX / es-ES) -- sirve cuando la
//      zona no está en la lista (por ejemplo alguien de viaje).
//   3. Cualquier zona europea se asume España, que es la única oficina de
//      Europa.
// Si ninguna resuelve, devuelve null y el formulario pregunta.

const TIMEZONE_COUNTRY: Record<string, string> = {
  "America/Mexico_City": "MX",
  "America/Monterrey": "MX",
  "America/Cancun": "MX",
  "America/Merida": "MX",
  "America/Matamoros": "MX",
  "America/Chihuahua": "MX",
  "America/Ciudad_Juarez": "MX",
  "America/Ojinaga": "MX",
  "America/Mazatlan": "MX",
  "America/Bahia_Banderas": "MX",
  "America/Hermosillo": "MX",
  "America/Tijuana": "MX",
  "Europe/Madrid": "ES",
  "Atlantic/Canary": "ES",
  "Africa/Ceuta": "ES",
};

export function detectCountryFromDevice(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (timeZone && TIMEZONE_COUNTRY[timeZone]) return TIMEZONE_COUNTRY[timeZone];

    const region = new Intl.Locale(navigator.language).region;
    if (region === "MX" || region === "ES") return region;

    if (timeZone?.startsWith("Europe/")) return "ES";

    return null;
  } catch {
    // Navegador viejo o Intl capado: no se adivina, se pregunta.
    return null;
  }
}
