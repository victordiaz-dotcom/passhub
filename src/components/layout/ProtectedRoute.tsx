import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// TODO: sigue el patrón de AssetFlow: ProtectedRoute valida sesión activa,
// y opcionalmente una lista de roles permitidos para esa ruta.
export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: Array<"admin" | "recepcion">;
}) {
  const { session, roles, loading } = useAuth();

  if (loading) return null; // TODO: spinner

  if (!session) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.some((r) => roles.includes(r))) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
