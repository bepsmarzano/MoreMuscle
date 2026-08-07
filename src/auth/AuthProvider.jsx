import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient.js";

const AuthContext = createContext(null);

// ---------------------------------------------------------------------------
// Sessione Supabase + profilo (ruolo admin/athlete) condivisi in tutta l'app
// tramite React context. `loading` resta true finché non sappiamo con
// certezza sia lo stato della sessione sia (se loggati) il profilo/ruolo.
// ---------------------------------------------------------------------------
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = non ancora controllata
  const [profile, setProfile] = useState(null);
  const [profileChecked, setProfileChecked] = useState(false);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); setProfileChecked(true); return; }
    setProfileChecked(false);
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) throw error;
      setProfile(data);
    } catch (e) {
      console.error("Errore nel caricamento profilo:", e);
      setProfile(null);
    } finally {
      setProfileChecked(true);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      loadProfile(data.session?.user?.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      loadProfile(newSession?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading: session === undefined || (!!session && !profileChecked),
    signOut: () => supabase.auth.signOut(),
    refreshProfile: () => loadProfile(session?.user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  return ctx;
}
