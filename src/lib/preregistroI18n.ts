export type Lang = "es" | "en";

const STORAGE_KEY = "passhub_prereg_lang";

export function getStoredLang(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "en" || value === "es" ? value : null;
  } catch {
    return null;
  }
}

export function hasStoredLang(): boolean {
  return getStoredLang() !== null;
}

export function storeLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage puede fallar en modo privado/ITP; el idioma solo se
    // pierde entre sesiones, no bloquea el flujo de pre-registro.
  }
}

function detectBrowserLang(): Lang {
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("en")
    ? "en"
    : "es";
}

// Orden de prioridad para el idioma inicial: ?lang= en la URL (viene de
// PreRegistro.tsx al navegar a la confirmación) > lo último elegido en este
// navegador > idioma del navegador > español por defecto.
export function resolveInitialLang(urlLang: string | null): Lang {
  if (urlLang === "en" || urlLang === "es") return urlLang;
  return getStoredLang() ?? detectBrowserLang();
}

export const PREREG_T = {
  es: {
    appName: "PassHub",
    subtitle: "Pre-registro de visita",
    intro: "Llena tus datos antes de llegar. Recibirás un código QR que deberás mostrar en recepción.",
    visitorName: "Tu nombre",
    visitorCompany: "Tu empresa",
    visitorPhone: "Teléfono",
    visitorEmail: "Correo electrónico",
    company: "Empresa que visitas",
    companyPlaceholder: "Selecciona una empresa",
    visitType: "Tipo de visita",
    visitTypePlaceholder: "Selecciona una opción",
    otros: "Otros",
    customVisitType: "Especifica el tipo de visita",
    hasVehicle: "¿Traes vehículo?",
    yes: "Sí",
    no: "No",
    vehiclePlate: "Placas",
    vehicleColor: "Color",
    vehicleModel: "Modelo",
    division: "División",
    divisionPlaceholder: "Selecciona una división",
    reason: "Motivo",
    visitDate: "Fecha de visita",
    visitTime: "Hora",
    submit: "Generar pre-registro",
    submitting: "Enviando...",
    errorCompany: "Selecciona la empresa que visitas.",
    errorVisitType: "Escribe el tipo de visita.",
    errorFallback: "No se pudo crear el pre-registro. Intenta de nuevo.",
    loading: "Cargando...",
    notAvailableTitle: "Pre-registro no disponible",
    notAvailableFallback: "Revisa que el link esté completo.",
    missingTokenInUrl: "Falta el código del pre-registro en el link.",
    loadErrorFallback: "No se pudo cargar el pre-registro. Intenta de nuevo.",
    unexpectedResponse: "No se pudo leer la información del pre-registro.",
    heading: "¡Todo listo para tu visita!",
    greeting: (name: string) => `Nos da mucho gusto recibirte, ${name}`,
    instructions: "Presenta este código QR en recepción para darte la bienvenida.",
    usedPrefix: "Ya se usó este pase",
    usedAt: (dateTime: string) => ` el ${dateTime}`,
    stillValidUntil: (date: string) => `. Sigue vigente para volver a ingresar hasta el ${date}.`,
    validUntil: (date: string) => `Vigente para ingresar hasta el ${date}.`,
    tapToZoom: "Toca el código para ampliarlo",
    downloadQr: "Descargar QR (PNG)",
    fieldVisitor: "Visitante",
    fieldCompany: "Empresa",
    fieldPhone: "Teléfono",
    fieldEmail: "Correo",
    fieldVisiting: "Visita a",
    fieldHost: "Recibe",
    fieldVisitType: "Tipo de visita",
    fieldDate: "Fecha",
    fieldTime: "Hora",
    fieldVehicle: "Vehículo",
    fieldPlate: "Placas",
    saveLinkNote: "Guarda este link o toma una captura de pantalla: es la única forma de volver a ver tu pase.",
    qrAlt: "Código QR ampliado",
    phoneLabel: "Teléfono",
  },
  en: {
    appName: "PassHub",
    subtitle: "Visit pre-registration",
    intro: "Fill in your details before you arrive. You'll get a QR code to show at reception.",
    visitorName: "Your name",
    visitorCompany: "Your company",
    visitorPhone: "Phone",
    visitorEmail: "Email",
    company: "Company you're visiting",
    companyPlaceholder: "Select a company",
    visitType: "Visit type",
    visitTypePlaceholder: "Select an option",
    otros: "Other",
    customVisitType: "Specify the visit type",
    hasVehicle: "Bringing a vehicle?",
    yes: "Yes",
    no: "No",
    vehiclePlate: "License plate",
    vehicleColor: "Color",
    vehicleModel: "Model",
    division: "Division",
    divisionPlaceholder: "Select a division",
    reason: "Reason",
    visitDate: "Visit date",
    visitTime: "Time",
    submit: "Generate pre-registration",
    submitting: "Sending...",
    errorCompany: "Select the company you're visiting.",
    errorVisitType: "Enter the visit type.",
    errorFallback: "Couldn't create the pre-registration. Please try again.",
    loading: "Loading...",
    notAvailableTitle: "Pre-registration not available",
    notAvailableFallback: "Check that the link is complete.",
    missingTokenInUrl: "The pre-registration code is missing from the link.",
    loadErrorFallback: "Couldn't load the pre-registration. Please try again.",
    unexpectedResponse: "Couldn't read the pre-registration information.",
    heading: "You're all set for your visit!",
    greeting: (name: string) => `We're glad to welcome you, ${name}`,
    instructions: "Show this QR code at reception to check in.",
    usedPrefix: "This pass was already used",
    usedAt: (dateTime: string) => ` on ${dateTime}`,
    stillValidUntil: (date: string) => `. It's still valid to enter again until ${date}.`,
    validUntil: (date: string) => `Valid to enter until ${date}.`,
    tapToZoom: "Tap the code to zoom in",
    downloadQr: "Download QR (PNG)",
    fieldVisitor: "Visitor",
    fieldCompany: "Company",
    fieldPhone: "Phone",
    fieldEmail: "Email",
    fieldVisiting: "Visiting",
    fieldHost: "Host",
    fieldVisitType: "Visit type",
    fieldDate: "Date",
    fieldTime: "Time",
    fieldVehicle: "Vehicle",
    fieldPlate: "License plate",
    saveLinkNote: "Save this link or take a screenshot: it's the only way to see your pass again.",
    qrAlt: "Enlarged QR code",
    phoneLabel: "Phone",
  },
} as const;

// El Edge Function public-preregister no recibe ni conoce el idioma
// (siempre responde en español); estos mensajes de error se traducen aquí
// en el frontend. Los nombres de negocio (empresas, tipos de visita,
// divisiones) nunca pasan por aquí, se muestran tal cual vienen.
const SERVER_ERROR_EN: Record<string, string> = {
  "Método no permitido.": "Method not allowed.",
  "Solicitud demasiado grande.": "Request too large.",
  "Demasiadas solicitudes. Espera unos minutos.": "Too many requests. Please wait a few minutes.",
  "Cuerpo de la solicitud inválido.": "Invalid request body.",
  "Falta token.": "Missing token.",
  "Pre-registro no encontrado.": "Pre-registration not found.",
  "Este pre-registro ya venció y no está disponible.": "This pre-registration has expired and is no longer available.",
  "Acción inválida.": "Invalid action.",
  "Faltan campos requeridos.": "Required fields are missing.",
  "Faltan los datos del vehículo (placas, color, modelo).": "Vehicle details are missing (plate, color, model).",
  "El teléfono solo debe contener números.": "The phone number can only contain digits.",
  "La fecha de la visita no puede ser anterior a hoy.": "The visit date can't be before today.",
  "La empresa no existe.": "That company doesn't exist.",
  "El colaborador no existe.": "That host doesn't exist.",
  "El colaborador ya no está activo.": "That host is no longer active.",
  "No se pudo crear el pre-registro.": "Couldn't create the pre-registration.",
};

export function translateServerError(message: string, lang: Lang): string {
  if (lang === "es") return message;
  return SERVER_ERROR_EN[message] ?? message;
}
