import { useState, useEffect } from "react";
import { Dumbbell, LogOut, Edit3 } from "lucide-react";
import { S, globalCss } from "../shared/ui.jsx";
import { Preview, Player } from "../player/WorkoutPlayer.jsx";
import Questionnaire from "./Questionnaire.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Home atleta: questionario non compilato -> Questionnaire; compilato ma
// nessun allenamento assegnato -> schermata d'attesa; altrimenti l'allenamento
// assegnato, con Preview/Player riusati identici dal modulo player.
// ---------------------------------------------------------------------------
export default function AthleteHome() {
  const { profile, signOut } = useAuth();
  const [questionnaire, setQuestionnaire] = useState(undefined); // undefined = in caricamento, null = non compilato
  const [workout, setWorkout] = useState(null);
  const [loadingWorkout, setLoadingWorkout] = useState(false);
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
    if (!profile.assigned_workout_id) { setWorkout(null); return; }
    let alive = true;
    setLoadingWorkout(true);
    (async () => {
      try {
        const w = await api.getAssignedWorkout(profile.assigned_workout_id);
        if (alive) setWorkout(w);
      } catch (e) {
        if (alive) setError(e.message || "Errore nel caricamento dell'allenamento.");
      } finally {
        if (alive) setLoadingWorkout(false);
      }
    })();
    return () => { alive = false; };
  }, [profile.assigned_workout_id]);

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

  if (questionnaire === undefined) {
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

  if (view === "play" && workout) {
    return <Player workout={workout} onExit={() => setView("preview")} />;
  }

  return (
    <div style={S.app}>
      <style>{globalCss}</style>
      {header}
      <main style={S.main}>
        {error && <p style={S.authError}>{error}</p>}
        {loadingWorkout && <p style={S.muted}>Caricamento allenamento…</p>}

        {!loadingWorkout && !workout && (
          <div style={S.waitCard}>
            <div style={S.startTitle}>Ci siamo quasi 💪</div>
            <p style={S.startMeta}>Il tuo questionario è stato inviato. Ti assegneremo a breve l'allenamento giusto per te.</p>
            <button style={S.ghostBtn} onClick={() => setEditingQuestionnaire(true)}><Edit3 size={14} /> Modifica questionario</button>
          </div>
        )}

        {!loadingWorkout && workout && (
          <>
            <Preview workout={workout} onStart={() => setView("play")} />
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <button style={S.ghostBtn} onClick={() => setEditingQuestionnaire(true)}><Edit3 size={14} /> Modifica questionario</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
