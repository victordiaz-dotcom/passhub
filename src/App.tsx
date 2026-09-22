import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Layout } from "@/components/layout/Layout";
import { IdleLogout } from "@/components/IdleLogout";
import { ThemeInitializer } from "@/components/ThemeInitializer";
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

// Redirect de la ruta pública vieja (/pre-registro/confirmacion/:token) a la
// nueva en inglés -- por si ya se compartió esa liga con algún visitante o
// proveedor (QR impreso, mensaje, etc.) antes del cambio de nombre de
// rutas. Conserva el token y el ?lang= tal cual.
function RedirectOldPreregConfirmacion() {
  const { token } = useParams();
  const location = useLocation();
  return <Navigate to={`/pre-register/confirmation/${token}${location.search}`} replace />;
}

// Guardia es de solo lectura y no tiene nada que hacer en el check-in
// completo: si la cuenta solo tiene ese rol, "/" le muestra la pantalla de
// guardia en vez de CheckIn. Hay que esperar "loading" (que ahora incluye
// la carga de roles, no solo de la sesión — ver useAuth.ts): sin esto, el
// primer render siempre ocurre con roles=[] y muestra CheckIn de entrada,
// aunque la cuenta sea de guardia.
function HomeRoute() {
  const { isGuardia, isAdmin, isRecepcion, loading } = useAuth();
  if (loading) return null;
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
        <Route path="/pre-register/confirmation/:token" element={<PreRegistroConfirmacion />} />
        {/* Rutas viejas en español -- redirect por si ya se compartieron
            ligas de pre-registro antes de este cambio de nombre. */}
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
