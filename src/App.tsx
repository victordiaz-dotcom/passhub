import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Layout } from "@/components/layout/Layout";
import { IdleLogout } from "@/components/IdleLogout";
import { ThemeInitializer } from "@/components/ThemeInitializer";
import { PageSkeleton } from "@/components/Skeleton";
import { useAuth } from "@/hooks/useAuth";
import Login from "@/pages/Login";
import ChangePassword from "@/pages/ChangePassword";
import PreRegistro from "@/pages/PreRegistro";
import PreRegistroConfirmacion from "@/pages/PreRegistroConfirmacion";
import CheckIn from "@/pages/CheckIn";
import Guardia from "@/pages/Guardia";
import Dashboard from "@/pages/Dashboard";
import Historial from "@/pages/Historial";
import Employees from "@/pages/Employees";
import Users from "@/pages/Users";
import AuditLog from "@/pages/AuditLog";
import Catalogs from "@/pages/Catalogs";

// Redirect de cualquier liga vieja con el token en la RUTA -- ya sea la
// ruta en español (/pre-registro/confirmacion/:token) o la propia ruta en
// inglés de antes de mover el token a un fragmento ("#") -- a la forma
// nueva, con el token después de "#" en vez de en la ruta o el query
// string (ver el comentario en PreRegistro.tsx sobre por qué). Conserva el
// ?lang= tal cual, solo mueve el token.
function RedirectOldPreregConfirmacion() {
  const { token } = useParams();
  const location = useLocation();
  return <Navigate to={`/pre-register/confirmation${location.search}#${token}`} replace />;
}

// Guardia es de solo lectura y no tiene nada que hacer en el check-in
// completo: si la cuenta solo tiene ese rol, "/" le muestra la pantalla de
// guardia en vez de CheckIn. Hay que esperar "loading" (que ahora incluye
// la carga de roles, no solo de la sesión — ver useAuth.ts): sin esto, el
// primer render siempre ocurre con roles=[] y muestra CheckIn de entrada,
// aunque la cuenta sea de guardia.
function HomeRoute() {
  const { isGuardia, isAdmin, isRecepcion, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  if (isGuardia && !isAdmin && !isRecepcion) return <Guardia />;
  return (
    <Layout>
      <CheckIn />
    </Layout>
  );
}

export default function App() {
  return (
    <>
      <ThemeInitializer />
      <IdleLogout />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/pre-register" element={<PreRegistro />} />
        {/* Links fijos por país para que cada colaborador comparta el que le
            corresponde (él sabe su país; la IP del visitante no siempre lo
            refleja) -- misma pantalla que /pre-register, solo fuerza la
            oficina en vez de intentar adivinarla. */}
        <Route path="/mx" element={<PreRegistro />} />
        <Route path="/es" element={<PreRegistro />} />
        <Route path="/pre-register/confirmation" element={<PreRegistroConfirmacion />} />
        {/* Rutas viejas con el token en la ruta -- redirect por si ya se
            compartieron ligas de pre-registro antes de mover el token a un
            fragmento ("#"), o antes del cambio de nombre de rutas al
            inglés. */}
        <Route path="/pre-register/confirmation/:token" element={<RedirectOldPreregConfirmacion />} />
        <Route path="/pre-registro" element={<Navigate to="/pre-register" replace />} />
        <Route path="/pre-registro/confirmacion/:token" element={<RedirectOldPreregConfirmacion />} />
        <Route
          path="/"
          element={
            <ProtectedRoute allowedRoles={["recepcion", "admin", "superadmin", "guardia"]}>
              <HomeRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute allowedRoles={["admin", "recepcion", "superadmin"]}>
              <Layout>
                <Historial />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <Layout>
                <Employees />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <Layout>
                <Users />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/catalogs"
          element={
            <ProtectedRoute allowedRoles={["admin", "superadmin"]}>
              <Layout>
                <Catalogs />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit-log"
          element={
            <ProtectedRoute allowedRoles={["superadmin"]}>
              <Layout>
                <AuditLog />
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}
