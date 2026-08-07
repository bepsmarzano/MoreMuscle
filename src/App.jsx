import { S, globalCss } from "./shared/ui.jsx";
import { supabaseConfigured } from "./lib/supabaseClient.js";
import { AuthProvider, useAuth } from "./auth/AuthProvider.jsx";
import LoginScreen from "./auth/LoginScreen.jsx";
import SetPassword from "./auth/SetPassword.jsx";
import WorkoutBuilder from "./admin/WorkoutBuilder.jsx";
import AthleteHome from "./athlete/AthleteHome.jsx";

// ---------------------------------------------------------------------------
// More Muscle — punto d'ingresso: autenticazione + smistamento admin/atleta.
// La UI vera e propria vive in ./admin (costruzione libreria/allenamenti +
// gestione atleti), ./athlete (questionario + allenamento assegnato) e
// ./player (Preview/Player, riusato identico dai due lati).
// ---------------------------------------------------------------------------
export default function App() {
  if (!supabaseConfigured) {
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        <div style={S.authWrap}>
          <div style={S.authCard}>
            <div style={S.authTitle}>Configurazione mancante</div>
            <p style={S.authSub}>
              Crea <code>.env.local</code> a partire da <code>.env.local.example</code> con
              l'URL e la anon key del tuo progetto Supabase, poi riavvia <code>npm run dev</code>.
              Vedi il README per i passi completi (schema.sql, promozione ad admin).
            </p>
          </div>
        </div>
      </div>
    );
  }

  // /set-password arriva dal link di invito via email: va gestito PRIMA di
  // qualunque logica di sessione/ruolo, indipendentemente da chi è loggato.
  if (typeof window !== "undefined" && window.location.pathname === "/set-password") {
    return (
      <>
        <style>{globalCss}</style>
        <SetPassword />
      </>
    );
  }

  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

function Gate() {
  const { loading, session, profile } = useAuth();

  if (loading) {
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        <div style={S.authWrap}><p style={S.muted}>Caricamento…</p></div>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  if (!profile) {
    // sessione valida ma nessuna riga in profiles: il trigger handle_new_user
    // (vedi supabase/schema.sql) non è stato eseguito o è fallito.
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        <div style={S.authWrap}>
          <div style={S.authCard}>
            <p style={S.authError}>Profilo non trovato. Verifica di aver eseguito supabase/schema.sql sul progetto Supabase.</p>
          </div>
        </div>
      </div>
    );
  }

  return profile.role === "admin" ? <WorkoutBuilder /> : <AthleteHome />;
}
