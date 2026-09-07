import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// TODO: sigue el patrón de AssetFlow: ProtectedRoute valida sesión activa,
// y opcionalmente una lista de roles permitidos para esa ruta.
export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: Array<"admin" | "recepcion" | "superadmin" | "guardia">;
}) {
  const { session, profile, roles, loading, signOut } = useAuth();

  if (loading) return null; // TODO: spinner

  if (!session) return <Navigate to="/login" replace />;

  if (profile && !profile.active) {
    signOut();
    return <Navigate to="/login" replace />;
  }

  if (profile?.must_change_password) {
    return <Navigate to="/cambiar-password" replace />;
  }

  if (allowedRoles && !allowedRoles.some((r) => roles.includes(r))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
