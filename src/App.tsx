import { Routes, Route } from "react-router-dom";
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

// Guardia es de solo lectura y no tiene nada que hacer en el check-in
// completo: si la cuenta solo tiene ese rol, "/" le muestra la pantalla de
// guardia en vez de CheckIn.
function HomeRoute() {
  const { isGuardia, isAdmin, isRecepcion } = useAuth();
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
        <Route path="/cambiar-password" element={<ChangePassword />} />
        <Route path="/pre-registro" element={<PreRegistro />} />
        <Route path="/pre-registro/confirmacion/:token" element={<PreRegistroConfirmacion />} />
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
          path="/historial"
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
      </Routes>
    </>
  );
}
