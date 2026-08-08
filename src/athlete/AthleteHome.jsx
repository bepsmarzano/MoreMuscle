import { useState, useEffect } from "react";
import { Dumbbell, LogOut, Edit3 } from "lucide-react";
import { S, globalCss } from "../shared/ui.jsx";
import { Preview, Player } from "../player/WorkoutPlayer.jsx";
import Questionnaire from "./Questionnaire.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Home atleta: questionario non compilato -> Questionnaire; nessun piano
// assegnato -> schermata d'attesa; piano finito -> messaggio di
// completamento; altrimenti la PROSSIMA sessione (assemblata al volo da
// api.getCurrentSession), con Preview/Player riusati identici dal modulo
// player. A fine sessione si avanza automaticamente alla successiva.
// ---------------------------------------------------------------------------
export default function AthleteHome() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [questionnaire, setQuestionnaire] = useState(undefined); // undefined = in caricamento, null = non compilato
  const [session, setSession] = useState(undefined); // undefined = in caricamento, null = nessun piano, {done:true} = piano finito
  const [maxes, setMaxes] = useState({});
  const [editingQuestionnaire, setEditingQuestionnaire] = useState(false);
  const [view, setView] = useState("preview"); // preview | play
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = await api.getQuestionnaire(profile.id);
        if (alive) setQuestionnaire(q || null);
      } catch (e) {
        if (alive) setError(e.message || "Errore nel caricamento del questionario.");
      }
    })();
    return () => { alive = false; };
  }, [profile.id]);

  useEffect(() => {
    if (!profile.assigned_plan_id) { setSession(null); return; }
    let alive = true;
    setSession(undefined);
    (async () => {
      try {
        const [s, athleteMaxes] = await Promise.all([api.getCurrentSession(profile), api.getAthleteMaxes(profile.id)]);
        if (!alive) return;
        setSession(s);
        setMaxes(Object.fromEntries(athleteMaxes.map((m) => [m.lift_key, m.max_kg])));
      } catch (e) {
        if (alive) setError(e.message || "Errore nel caricamento dell'allenamento.");
      }
    })();
    return () => { alive = false; };
  }, [profile.assigned_plan_id, profile.current_session_position]);

  const handleLog = ({ exerciseName, reps, loadLabel }) => {
    api.logExerciseSet({
      athleteId: profile.id,
      planId: profile.assigned_plan_id,
      sessionPosition: profile.current_session_position,
      exerciseName, reps, loadLabel,
    }).catch((e) => setError(e.message));
  };

  const handleFinish = async () => {
    try {
      await api.completeCurrentSession();
      setSession(undefined); // evita di mostrare per un istante la sessione appena conclusa
      await refreshProfile(); // aggiorna current_session_position -> l'effetto sopra ricarica la sessione successiva
      setView("preview");
    } catch (e) {
      setError(e.message || "Impossibile completare la sessione.");
    }
  };

  const header = (
    <header style={S.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={S.logoMark}><Dumbbell size={18} /></div>
        <div>
          <div style={S.logoText}>MORE MUSCLE</div>
          <div style={S.logoSub}>{profile.full_name || profile.email}</div>
        </div>
      </div>
      <button style={S.ghostBtn} onClick={signOut}><LogOut size={15} /> Esci</button>
    </header>
  );

  if (questionnaire === undefined || session === undefined) {
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        {header}
        <main style={S.main}><p style={S.muted}>Caricamento…</p></main>
      </div>
    );
  }

  if (!questionnaire || editingQuestionnaire) {
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        {header}
        <main style={S.main}>
          <Questionnaire
            athleteId={profile.id}
            initial={questionnaire}
            onSaved={async () => {
              setEditingQuestionnaire(false);
              setQuestionnaire(await api.getQuestionnaire(profile.id));
            }}
          />
        </main>
      </div>
    );
  }

  if (view === "play" && session && !session.done) {
    return <Player workout={session} onExit={() => setView("preview")} onLog={handleLog} onFinish={handleFinish} maxesByLiftKey={maxes} />;
  }

  return (
    <div style={S.app}>
      <style>{globalCss}</style>
      {header}
      <main style={S.main}>
        {error && <p style={S.authError}>{error}</p>}

        {!session && (
          <div style={S.waitCard}>
            <div style={S.startTitle}>Ci siamo quasi 💪</div>
            <p style={S.startMeta}>Il tuo questionario è stato inviato. Ti assegneremo a breve il tuo piano di allenamento.</p>
            <button style={S.ghostBtn} onClick={() => setEditingQuestionnaire(true)}><Edit3 size={14} /> Modifica questionario</button>
          </div>
        )}

        {session?.done && (
          <div style={S.waitCard}>
            <div style={S.startTitle}>Piano completato 🎉</div>
            <p style={S.startMeta}>Hai portato a termine tutte le {session.totalSessions} sessioni del tuo piano. Parla con il tuo coach per il prossimo.</p>
          </div>
        )}

        {session && !session.done && (
          <>
            <Preview workout={session} onStart={() => setView("play")} />
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <button style={S.ghostBtn} onClick={() => setEditingQuestionnaire(true)}><Edit3 size={14} /> Modifica questionario</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
