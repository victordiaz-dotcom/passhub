import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { Layout } from "@/components/layout/Layout";
import Login from "@/pages/Login";
import PreRegistro from "@/pages/PreRegistro";
import PreRegistroConfirmacion from "@/pages/PreRegistroConfirmacion";
import CheckIn from "@/pages/CheckIn";
import Dashboard from "@/pages/Dashboard";
import Employees from "@/pages/Employees";
import Users from "@/pages/Users";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/pre-registro" element={<PreRegistro />} />
      <Route path="/pre-registro/confirmacion/:id" element={<PreRegistroConfirmacion />} />
      <Route
        path="/"
        element={
          <ProtectedRoute allowedRoles={["recepcion", "admin"]}>
            <CheckIn />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/employees"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Layout>
              <Employees />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <Layout>
              <Users />
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
