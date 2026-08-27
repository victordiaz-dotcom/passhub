import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type Role = Tables<"user_roles">["role"];

// TODO (siguiente paso en VS Code / Claude Code):
// - cargar profile + roles del usuario autenticado desde Supabase
// - exponer companyId activo, isAdmin / isRecepcion
// Sigue el mismo patrón que useAuth() en AssetFlow: un hook por dominio de datos.
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
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
      return;
    }

    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data));

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .then(({ data }) => setRoles((data ?? []).map((r) => r.role)));
  }, [session?.user?.id]);

  return {
    session,
    profile,
    roles,
    isAdmin: roles.includes("admin"),
    isRecepcion: roles.includes("recepcion"),
    loading,
  };
}
