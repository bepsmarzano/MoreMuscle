import { useState, useEffect } from "react";
import { Dumbbell, LogOut, Edit3, Flame, Repeat, SkipForward, ChevronLeft, Play, MessageCircle, Home } from "lucide-react";
import { S, globalCss } from "../shared/ui.jsx";
import { Preview, Player } from "../player/WorkoutPlayer.jsx";
import Questionnaire from "./Questionnaire.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import * as api from "../lib/api.js";

// le 3 sezioni sono indipendenti: ognuna la propria "prossima sessione",
// il proprio modo di segnarla completata, e solo il Circuito è saltabile.
const SECTIONS = [
  { key: "warmup", label: "Riscaldamento", icon: Flame, getNext: api.getNextWarmup, complete: api.completeWarmup, canSkip: false },
  { key: "strength", label: "Forza", icon: Dumbbell, getNext: api.getNextStrengthSession, complete: api.completeStrengthSession, canSkip: false },
  { key: "circuit", label: "Circuito", icon: Repeat, getNext: api.getNextCircuitSession, complete: api.completeCircuitSession, canSkip: true },
];

// ---------------------------------------------------------------------------
// Home atleta: questionario non compilato -> Questionnaire; altrimenti un
// menu con le 3 sezioni (Riscaldamento/Forza/Circuito), ciascuna con la
// propria "prossima sessione" — si avanzano indipendentemente, saltare una
// sezione oggi significa semplicemente ritrovarla identica la volta dopo.
// ---------------------------------------------------------------------------
export default function AthleteHome() {
  const { profile, signOut, refreshProfile } = useAuth();
  // pagina iniziale: si vede a ogni apertura dell'app (non solo la prima
  // volta) — "Vai agli allenamenti" la supera solo per questa visita.
  const [showLanding, setShowLanding] = useState(true);
  const [settings, setSettings] = useState(null);
  const [questionnaire, setQuestionnaire] = useState(undefined); // undefined = in caricamento, null = non compilato
  const [editingQuestionnaire, setEditingQuestionnaire] = useState(false);
  const [sessions, setSessions] = useState({});
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [openSection, setOpenSection] = useState(null); // "warmup" | "strength" | "circuit" | null
  const [view, setView] = useState("preview"); // preview | play (della sezione aperta)
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const s = await api.getAppSettings(); if (alive) setSettings(s); }
      catch { /* non bloccante: senza impostazioni la pagina iniziale mostra solo il pulsante */ }
    })();
    return () => { alive = false; };
  }, []);

  const enterApp = () => setShowLanding(false);
  const backToLanding = () => setShowLanding(true);

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

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const [warmup, strength, circuit] = await Promise.all([
        api.getNextWarmup(profile), api.getNextStrengthSession(profile), api.getNextCircuitSession(profile),
      ]);
      setSessions({ warmup, strength, circuit });
      setError("");
    } catch (e) {
      setError(e.message || "Errore nel caricamento degli allenamenti.");
    } finally {
      setLoadingSessions(false);
    }
  };

  // riparte da capo ogni volta che il profilo cambia (incluso dopo aver
  // completato una sessione, via refreshProfile in handleFinish)
  useEffect(() => { loadSessions(); }, [profile]);

  const openPreview = (key) => { setOpenSection(key); setView("preview"); };
  const closeSection = () => { setOpenSection(null); setView("preview"); };

  const handleLog = ({ exerciseName, reps, loadLabel }) => {
    api.logExerciseSet({ athleteId: profile.id, exerciseName, reps, loadLabel }).catch((e) => setError(e.message));
  };

  const handleFinish = async (sectionDef) => {
    try {
      await sectionDef.complete();
      await refreshProfile();
      closeSection();
    } catch (e) {
      setError(e.message || "Impossibile completare l'allenamento.");
    }
  };

  const header = (
    <header style={S.header}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo.png" alt="Viltrum Fitness" style={S.logoImgSmall} />
        <div>
          <div style={S.logoText}>MORE MUSCLE</div>
          <div style={S.logoSub}>{profile.full_name || profile.email}</div>
        </div>
      </div>
      <button style={S.ghostBtn} onClick={signOut}><LogOut size={15} /> Esci</button>
    </header>
  );

  if (showLanding) {
    const waNumber = (settings?.whatsapp_number || "").replace(/[^\d]/g, "");
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        {header}
        <main style={S.main}>
          <div style={S.landingHero}>
            <img src="/logo.png" alt="Viltrum Fitness" style={S.logoImgBig} />
            <div style={S.landingTitle}>Ciao {profile.full_name || "atleta"}!</div>
            <button style={S.startBtn} onClick={enterApp}><Play size={20} /> Vai agli allenamenti</button>
          </div>

          {settings?.instructions_text && (
            <div style={S.instructionsCard}>
              <div style={S.blockLabel}>COME FUNZIONA</div>
              <p style={S.instructionsText}>{settings.instructions_text}</p>
            </div>
          )}

          {waNumber && (
            <a style={S.whatsappBtn} href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={18} /> Contattami
            </a>
          )}
        </main>
      </div>
    );
  }

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

  // una sezione è aperta: la sua Preview, poi il Player, a schermo intero
  if (openSection) {
    const def = SECTIONS.find((s) => s.key === openSection);
    const workout = sessions[openSection];

    if (view === "play" && workout && !workout.done) {
      return <Player workout={workout} onExit={() => setView("preview")} onHome={closeSection} onLog={handleLog} onFinish={() => handleFinish(def)} />;
    }

    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        {header}
        <main style={S.main}>
          {error && <p style={S.authError}>{error}</p>}
          {workout && !workout.done ? (
            <>
              <Preview workout={workout} onStart={() => setView("play")} onBack={closeSection} />
              {def.canSkip && (
                <div style={{ marginTop: 16, textAlign: "center" }}>
                  <button style={S.ghostBtn} onClick={closeSection}>
                    <SkipForward size={14} /> Salta per oggi — te lo riproponiamo la prossima volta
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={S.waitCard}>
              <div style={S.startTitle}>{workout?.done ? "Programma completato 🎉" : `Nessun ${def.label.toLowerCase()} assegnato`}</div>
              <p style={S.startMeta}>
                {workout?.done ? "Hai finito tutte le sessioni di questo programma." : "Il tuo allenatore non te l'ha ancora assegnato."}
              </p>
              <button style={S.ghostBtn} onClick={closeSection}><ChevronLeft size={14} /> Torna al menu</button>
            </div>
          )}
        </main>
      </div>
    );
  }

  // menu principale: le 3 sezioni indipendenti
  const nothingAssigned = !loadingSessions && !sessions.warmup && !sessions.strength && !sessions.circuit;

  return (
    <div style={S.app}>
      <style>{globalCss}</style>
      {header}
      <main style={S.main}>
        {error && <p style={S.authError}>{error}</p>}
        {loadingSessions ? (
          <p style={S.muted}>Caricamento…</p>
        ) : (
          <>
            {nothingAssigned && <p style={S.muted}>Il tuo allenatore non ti ha ancora assegnato nulla — torna più tardi.</p>}
            <div style={S.cardGrid}>
              {SECTIONS.map((def) => {
                const w = sessions[def.key];
                const statusText = !w ? "Non assegnato" : w.done ? "Programma completato" : w.name;
                return (
                  <div key={def.key} style={S.card}>
                    <div style={{ flex: 1 }}>
                      <div style={S.cardTitle}><def.icon size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{def.label}</div>
                      <div style={S.cardMeta}><span>{statusText}</span></div>
                    </div>
                    <div style={S.cardActions}>
                      {w && !w.done && <button style={S.primaryBtn} onClick={() => openPreview(def.key)}>Vai</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={S.ghostBtn} onClick={backToLanding}><Home size={14} /> Home</button>
          <button style={S.ghostBtn} onClick={() => setEditingQuestionnaire(true)}><Edit3 size={14} /> Modifica questionario</button>
        </div>
      </main>
    </div>
  );
}
