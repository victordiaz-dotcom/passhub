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
    // rebinding, CWE-346). Eso NO afecta el acceso LAN por IP de arriba
    // (un celular en la misma red entrando por http://192.168.x.x:5173
    // sigue funcionando siempre, sin configurar nada más).
    //
    // Lo que sí bloquea es el caso de compartir el dev server por un
    // túnel/puerto reenviado con un tester externo (ver commit 07a775f,
    // caso de Gustavo): ese Host no es localhost ni una IP privada, así
    // que Vite responde "Blocked request. This host is not allowed".
    //
    // ¡OJO, quien edite este archivo!: NO pongas `allowedHosts: true` --
    // eso desactiva la protección para *cualquier* Host y es exactamente
    // la vulnerabilidad (DNS rebinding) que este código evita. En vez de
    // eso, define el/los host(s) del túnel en la variable de entorno
    // DEV_SERVER_ALLOWED_HOSTS (ver .env.example) justo antes de levantar
    // el túnel, por ejemplo:
    //
    //   DEV_SERVER_ALLOWED_HOSTS=mi-tunel.trycloudflare.com npm run dev
    //
    // Si el túnel genera un subdominio distinto cada vez y no se conoce
    // el host exacto de antemano (túneles "quick" de Cloudflare/ngrok),
    // Vite permite comodines de subdominio con un string que empiece en
    // ".": usa el dominio del proveedor del túnel, ej.:
    //
    //   DEV_SERVER_ALLOWED_HOSTS=.trycloudflare.com npm run dev
    //
    // Varios hosts se separan con coma. Sin esta variable, el server
    // sigue funcionando normal para localhost y LAN por IP; solo el Host
    // del túnel queda bloqueado hasta que la definas.
    allowedHosts: process.env.DEV_SERVER_ALLOWED_HOSTS
      ? process.env.DEV_SERVER_ALLOWED_HOSTS.split(",")
          .map((host) => host.trim())
          .filter(Boolean)
      : undefined,
  },
});
