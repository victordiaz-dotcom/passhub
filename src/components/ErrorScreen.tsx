import type { ReactNode } from "react";
import { ArrowLeft, CircleAlert, FileQuestion, House, RotateCw, ServerCrash } from "lucide-react";

type ErrorScreenProps = {
  status: number;
  title: string;
  description: string;
  primaryLabel?: string;
  primaryHref?: string;
  onRetry?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  headerAction?: ReactNode;
  locale?: "es" | "en";
};

export function ErrorScreen({
  status,
  title,
  description,
  primaryLabel = "Ir al inicio",
  primaryHref = "/",
  onRetry,
  secondaryLabel = "Volver atrás",
  secondaryHref,
  headerAction,
  locale = "es",
}: ErrorScreenProps) {
  const Icon = status >= 500 ? ServerCrash : status === 404 ? FileQuestion : CircleAlert;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <a href="/" className="inline-flex items-center gap-2 font-display text-lg font-bold text-ink hover:text-accent" aria-label={locale === "en" ? "PassHub, go home" : "PassHub, ir al inicio"}>
          <img src="/logo.png" alt="" className="h-7 w-auto" />
          PassHub
        </a>
        {headerAction}
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16 pt-8 sm:px-8">
        <section className="card grid w-full max-w-3xl overflow-hidden p-0 md:grid-cols-[220px_minmax(0,1fr)]" aria-labelledby="error-title">
          <div className="flex flex-col justify-between gap-8 border-b border-line bg-accent-tint p-7 md:border-b-0 md:border-r md:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-card text-accent shadow-sm">
              <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent-dark">{locale === "en" ? "Request status" : "Estado de la solicitud"}</p>
              <p className="mt-1 font-display text-6xl font-bold leading-none tracking-tight text-accent-dark sm:text-7xl" aria-label={`Error ${status}`}>{status}</p>
            </div>
          </div>

          <div className="flex flex-col justify-center p-7 sm:p-10">
            <h1 id="error-title" className="font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">{title}</h1>
            <p className="mt-3 max-w-prose text-sm leading-6 text-ink-soft sm:text-base">{description}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {onRetry ? (
                <button type="button" onClick={onRetry} className="btn-primary inline-flex h-10 items-center gap-2">
                  <RotateCw size={16} aria-hidden="true" />{primaryLabel}
                </button>
              ) : (
                <a href={primaryHref} className="btn-primary inline-flex h-10 items-center gap-2 hover:text-white">
                  <House size={16} aria-hidden="true" />{primaryLabel}
                </a>
              )}
              {secondaryHref ? (
                <a href={secondaryHref} className="btn-secondary inline-flex h-10 items-center gap-2 px-4 text-sm font-medium hover:text-ink">
                  <ArrowLeft size={16} aria-hidden="true" />{secondaryLabel}
                </a>
              ) : (
                <button type="button" onClick={() => window.history.back()} className="btn-secondary inline-flex h-10 items-center gap-2 px-4 text-sm font-medium">
                  <ArrowLeft size={16} aria-hidden="true" />{secondaryLabel}
                </button>
              )}
            </div>
          </div>
        </section>
      </main>
      <footer className="px-5 pb-5 text-center text-xs text-ink-soft">{locale === "en" ? "PassHub · Visitor access and check-in" : "PassHub · Control de acceso y visitas"}</footer>
    </div>
  );
}
