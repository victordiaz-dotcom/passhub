import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local."
  );
}

// La publishable/anon key es segura de exponer en el cliente: el acceso real
// a los datos lo controla Row Level Security (RLS) en Postgres, no esta key.
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    // sessionStorage en vez del localStorage por defecto: la sesión se borra
    // sola al cerrar la pestaña/el navegador, para cualquier rol (recepción,
    // guardia, admin) -- en vez de quedar guardada indefinidamente en el
    // equipo. No afecta el cierre por inactividad (IdleLogout.tsx), que
    // sigue aplicando solo a admin/superadmin mientras la sesión sigue
    // abierta.
    storage: window.sessionStorage,
  },
});
