import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Sin esto, Vite solo escucha en localhost: aunque el puerto esté
    // abierto/reenviado, ninguna conexión desde otro dispositivo en la
    // misma red (ej. un celular probando la app) llega siquiera a tocar
    // el servidor.
    host: true,
  },
});
