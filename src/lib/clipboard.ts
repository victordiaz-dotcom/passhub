// navigator.clipboard requiere contexto seguro (https o localhost) -- igual
// que crypto.randomUUID (ver randomId() en CheckIn.tsx), falla en silencio
// al entrar por IP local en http. Fallback con un textarea temporal +
// execCommand, que sí funciona en contexto inseguro.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // sigue al fallback
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
