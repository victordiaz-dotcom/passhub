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
    // Desde Vite 5.4, aunque el servidor SÍ escuche en la red (host:
    // true), Vite igual rechaza cualquier petición cuyo encabezado Host
    // no sea localhost/una IP privada conocida (protección contra DNS
    // rebinding) -- exactamente el caso de compartir el puerto por un
    // túnel o una IP pública para que un tester externo entre. Sin esto,
    // Vite responde "Blocked request. This host is not allowed" antes de
    // que la página siquiera cargue para esa persona.
    allowedHosts: true,
  },
});
