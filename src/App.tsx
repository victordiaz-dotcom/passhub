import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import Login from "@/pages/Login";
import CheckIn from "@/pages/CheckIn";
import Dashboard from "@/pages/Dashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
            <Dashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
