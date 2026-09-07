import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";

const IDLE_LIMIT_MS = 30 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"];

// Solo admin (isAdmin ya es true para super admin también, porque carga
// ambos roles): recepción se queda logueada (comparten un mismo equipo de
// mostrador todo el turno), pero una cuenta de admin/super admin debe cerrar
// sesión sola tras 30 minutos sin actividad.
export function IdleLogout() {
  const { isAdmin, signOut } = useAuth();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    function resetTimer() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => signOut(), IDLE_LIMIT_MS);
    }

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  return null;
}
