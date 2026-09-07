import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function ChangePassword() {
  const { session, profile, isAdmin, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (profile && !profile.must_change_password) {
    return <Navigate to={isAdmin ? "/admin" : "/"} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      console.error(updateError);
      setError("No se pudo actualizar la contraseña. Intenta de nuevo.");
      setSubmitting(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", session!.user.id);

    if (profileError) {
      console.error(profileError);
      setError("Tu contraseña se actualizó, pero no se pudo terminar el proceso. Contacta a tu admin.");
      setSubmitting(false);
      return;
    }

    // Recarga completa para que useAuth vuelva a leer el profile ya
    // actualizado (must_change_password=false) y no rebote aquí de nuevo.
    window.location.href = isAdmin ? "/admin" : "/";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-sm rounded-xl border border-line bg-card p-10 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-bold text-ink">Cambia tu contraseña</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Es tu primer inicio de sesión o tu contraseña fue restablecida. Elige una nueva
            contraseña para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-soft">
              Nueva contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-ink-soft">
              Confirmar contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
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
            className="w-full rounded-md bg-accent px-3 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "Guardando..." : "Guardar contraseña"}
          </button>
        </form>
      </div>
    </div>
  );
}
