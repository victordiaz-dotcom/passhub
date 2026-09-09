import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type Role = Tables<"user_roles">["role"];

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Se separa del check de sesión: sin esto, "loading" pasaba a false en
  // cuanto se resolvía getSession(), ANTES de que profiles/user_roles
  // terminaran de cargar — cualquier componente que decidiera algo por rol
  // en ese instante (ProtectedRoute, HomeRoute) lo hacía con roles=[]
  // todavía. Para admin/recepción no se notaba porque la vista "por
  // defecto" ya era la correcta; para guardia significaba renderizar de
  // entrada la pantalla de check-in de escritorio en vez del panel de
  // guardia.
  const [rolesLoading, setRolesLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setRoles([]);
      setRolesLoading(false);
      return;
    }

    setRolesLoading(true);

    Promise.all([
      supabase.from("profiles").select("*").eq("id", session.user.id).single(),
      supabase.from("user_roles").select("role").eq("user_id", session.user.id),
    ]).then(([profileResult, rolesResult]) => {
      setProfile(profileResult.data);
      setRoles((rolesResult.data ?? []).map((r) => r.role));
      setRolesLoading(false);
    });
  }, [session?.user?.id]);

  const signOut = () => supabase.auth.signOut();

  return {
    session,
    profile,
    roles,
    companyId: profile?.company_id ?? null,
    mustChangePassword: profile?.must_change_password ?? false,
    // superadmin siempre cuenta como admin: RLS/Edge Functions ya lo tratan
    // así (has_role(admin) OR has_role(superadmin)), esto lo alinea del
    // lado del frontend — antes una cuenta con SOLO el rol superadmin
    // quedaba fuera de las rutas/menú/cierre de sesión automático de admin.
    isAdmin: roles.includes("admin") || roles.includes("superadmin"),
    isRecepcion: roles.includes("recepcion"),
    isSuperadmin: roles.includes("superadmin"),
    isGuardia: roles.includes("guardia"),
    loading: sessionLoading || rolesLoading,
    signOut,
  };
}
