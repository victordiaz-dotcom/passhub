import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { APP_VERSION } from "@/lib/version";

export default function Login() {
  const { session, loading: authLoading } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authLoading && session) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const trimmed = identifier.trim();
    // Un espacio al final es invisible en un campo de contraseña, y los
    // teclados de celular (autocorrección, autocompletar, texto por gestos)
    // lo insertan ahí con mucha más frecuencia que un teclado físico — sin
    // este trim, eso bastaba para que un login por lo demás correcto
    // fallara siempre, solo desde el celular.
    const trimmedPassword = password.trim();

    if (trimmed.includes("@")) {
      const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password: trimmedPassword });
      if (error) {
        setError("Usuario o contraseña incorrectos.");
        setSubmitting(false);
      }
      return;
    }

    // Login por username: la Edge Function resuelve el correo y valida la
    // contraseña del lado del servidor — nunca nos entrega el correo real,
    // y "usuario no existe" y "contraseña incorrecta" dan la misma respuesta.
    const { data, error: fnError } = await supabase.functions.invoke("resolve-username", {
      body: { username: trimmed, password: trimmedPassword },
    });

    if (fnError || !data?.session) {
      setError("Usuario o contraseña incorrectos.");
      setSubmitting(false);
      return;
    }

    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    if (setSessionError) {
      setError("Usuario o contraseña incorrectos.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="card w-full max-w-sm p-10">
        <div className="mb-8 text-center">
          <img src="/logo.png" alt="PassHub" className="mx-auto mb-3 h-16 w-auto" />
          <h1 className="font-display text-2xl font-bold text-ink">
            PassHub <span className="text-base font-medium text-ink-soft">{APP_VERSION}</span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">Sistema de control de visitas</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-ink-soft">
              Usuario o correo
            </label>
            <input
              id="identifier"
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="input-field h-auto py-2.5"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-soft">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field h-auto py-2.5"
            />
          </div>

          {error && (
            <div className="rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary h-auto w-full py-2.5"
          >
            {submitting ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-soft">
          Las cuentas las crea el administrador. Si no tienes acceso, contacta a tu admin.
        </p>
      </div>
    </div>
  );
}
