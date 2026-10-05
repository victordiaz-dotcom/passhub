import { Component, type ReactNode } from "react";
import { ErrorScreen } from "@/components/ErrorScreen";

// Red de seguridad de última instancia: sin esto, cualquier error de
// render en cualquier parte de la app (uno ya existente o uno futuro)
// desmonta todo React y deja una pantalla en blanco permanente, sin forma
// de recuperarse salvo refrescar manualmente.
type State = { hasError: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("Error de render no capturado:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen
          status={500}
          title="No pudimos mostrar esta página"
          description="Ocurrió un problema inesperado. Vuelve a cargar la página; si continúa, avisa al administrador."
          primaryLabel="Recargar página"
          onRetry={() => window.location.reload()}
          secondaryLabel="Ir al inicio"
          secondaryHref="/"
        />
      );
    }

    return this.props.children;
  }
}
