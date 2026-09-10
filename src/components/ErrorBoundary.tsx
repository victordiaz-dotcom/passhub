import { Component, type ReactNode } from "react";

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
        <div className="flex min-h-screen items-center justify-center bg-paper p-6">
          <div className="card w-full max-w-lg p-8 text-center">
            <h1 className="mb-2 font-display text-lg font-bold text-ink">Algo salió mal</h1>
            <p className="mb-4 text-sm text-ink-soft">
              Ocurrió un error inesperado. Intenta recargar la página.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
