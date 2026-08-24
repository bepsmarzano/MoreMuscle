import { useState, useEffect } from "react";
import { Dumbbell, LogOut, Edit3, Flame, Repeat, SkipForward, ChevronLeft, Play, MessageCircle, Home, User } from "lucide-react";
import { S, globalCss, prefetchGifs } from "../shared/ui.jsx";
import { Preview, Player, collectGifUrls } from "../player/WorkoutPlayer.jsx";
import Questionnaire from "./Questionnaire.jsx";
import Profile from "./Profile.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import * as api from "../lib/api.js";

// le 3 sezioni sono indipendenti. Riscaldamento: un'unica "prossima
// sessione" che ruota all'infinito (invariato). Forza/Circuito: fino a 3
// sessioni tra cui scegliere (choice: true) — sessions[key] è un array di
// candidate invece di un singolo workout, vedi getStrengthChoices/
// getCircuitChoices in api.js.
const SECTIONS = [
  { key: "warmup", label: "Riscaldamento", icon: Flame, choice: false, getNext: api.getNextWarmup, complete: api.completeWarmup },
  { key: "strength", label: "Forza", icon: Dumbbell, choice: true, getNext: api.getStrengthChoices, resolve: api.resolveStrengthSession },
  { key: "circuit", label: "Circuito", icon: Repeat, choice: true, getNext: api.getCircuitChoices, resolve: api.resolveCircuitSession },
];

// ---------------------------------------------------------------------------
// Home atleta: questionario non compilato -> Questionnaire; altrimenti un
// menu con le 3 sezioni, indipendenti tra loro. Riscaldamento: un'unica
// "prossima sessione" che ruota all'infinito. Forza/Circuito: fino a 3
// sessioni tra cui scegliere — farne una la completa per sempre, scartarla
// la rimanda in fondo alla coda (vedi resolveStrengthSession/
// resolveCircuitSession in api.js).
// ---------------------------------------------------------------------------
export default function AthleteHome() {
  const { profile, signOut, refreshProfile } = useAuth();
  // pagina iniziale: si vede a ogni apertura dell'app (non solo la prima
  // volta) — "Vai agli allenamenti" la supera solo per questa visita.
  const [showLanding, setShowLanding] = useState(true);
  const [settings, setSettings] = useState(null);
  const [questionnaire, setQuestionnaire] = useState(undefined); // undefined = in caricamento, null = non compilato
  const [editingQuestionnaire, setEditingQuestionnaire] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [maxesByLiftKey, setMaxesByLiftKey] = useState({});
  const [sessions, setSessions] = useState({});
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [openSection, setOpenSection] = useState(null); // "warmup" | "strength" | "circuit" | null
  const [view, setView] = useState("preview"); // choose | preview | play (della sezione aperta)
  const [chosenWorkout, setChosenWorkout] = useState(null); // Forza/Circuito: quale delle candidate scelte
  const [discardingId, setDiscardingId] = useState(null);
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
      const [warmup, strength, circuit] = await Promise.all(SECTIONS.map((def) => def.getNext(profile)));
      setSessions({ warmup, strength, circuit });
      // pre-scarica le GIF dei prossimi allenamenti delle 3 sezioni appena si
      // sa quali sono, non quando l'atleta le apre — così quando entra in un
      // allenamento le trova già pronte invece di vederle nere finché caricano.
      // Ordine di priorità: Riscaldamento poi Forza poi Circuito (l'ordine in
      // cui si fanno di solito in palestra), e dentro ogni sessione l'ordine
      // di esecuzione degli esercizi — le prime in assoluto ad alta priorità
      // (competono meno con altro traffico), il resto a bassa priorità: non
      // deve mai rallentare la GIF che l'atleta sta guardando in quel momento.
      // Forza/Circuito ora sono array di candidate (fino a 3), non un singolo
      // workout: si appiattiscono allo stesso modo.
      const asList = (x) => (Array.isArray(x) ? x : [x]);
      const orderedGifUrls = [warmup, strength, circuit].flatMap((s) => asList(s).flatMap((w) => collectGifUrls(w)));
      prefetchGifs(orderedGifUrls.slice(0, 4), "high");
      prefetchGifs(orderedGifUrls.slice(4), "low");
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

  // massimali dell'atleta, per calcolare in automatico il peso di lavoro nel
  // blocco Forza (percentuale × massimale) — passati al Player più sotto.
  const loadMaxes = async () => {
    try {
      const rows = await api.getMyMaxes();
      const map = {};
      rows.forEach((r) => { map[r.lift_key] = r.max_kg; });
      setMaxesByLiftKey(map);
    } catch (e) {
      setError(e.message || "Errore nel caricamento dei massimali.");
    }
  };
  useEffect(() => { loadMaxes(); }, [profile]);

  const openPreview = (key) => {
    const def = SECTIONS.find((s) => s.key === key);
    setOpenSection(key);
    setChosenWorkout(null);
    setView(def.choice ? "choose" : "preview");
  };
  const closeSection = () => { setOpenSection(null); setChosenWorkout(null); setView("preview"); };

  // Forza/Circuito: scegliere una delle candidate apre la sua Anteprima;
  // scartarla la risolve subito (torna in fondo alla coda) senza giocarla.
  const chooseCandidate = (w) => { setChosenWorkout(w); setView("preview"); };
  const discardCandidate = async (sectionDef, w) => {
    setDiscardingId(w.id);
    try {
      await sectionDef.resolve(w.queueIndex, true);
      await refreshProfile();
    } catch (e) {
      setError(e.message || "Operazione non riuscita.");
    } finally {
      setDiscardingId(null);
    }
  };

  const handleLog = ({ exerciseName, reps, loadLabel, weightKg }) => {
    api.logExerciseSet({ athleteId: profile.id, exerciseName, reps, loadLabel, weightKg }).catch((e) => setError(e.message));
  };

  const handleGetLastLoadLabels = (exerciseNames) => api.getLastLoadLabels(profile.id, exerciseNames);

  const handleFinish = async (sectionDef, workout) => {
    try {
      if (sectionDef.choice) await sectionDef.resolve(workout.queueIndex, false);
      else await sectionDef.complete();
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

  if (showProfile) {
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        {header}
        <main style={S.main}>
          <Profile profile={profile} onSaved={refreshProfile} />
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button style={S.ghostBtn} onClick={() => { setShowProfile(false); loadMaxes(); }}><ChevronLeft size={14} /> Torna al menu</button>
          </div>
        </main>
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

  // una sezione è aperta. Riscaldamento: Anteprima poi Player, come sempre.
  // Forza/Circuito: prima la scelta tra le candidate, poi Anteprima di quella
  // scelta, poi Player.
  if (openSection) {
    const def = SECTIONS.find((s) => s.key === openSection);
    const raw = sessions[openSection];
    const workout = def.choice ? chosenWorkout : raw;

    if (view === "play" && workout && !workout.done) {
      return (
        <Player workout={workout} onExit={() => setView(def.choice ? "choose" : "preview")} onHome={closeSection}
          onLog={handleLog} onGetLastLoadLabels={handleGetLastLoadLabels} onFinish={() => handleFinish(def, workout)} maxesByLiftKey={maxesByLiftKey} />
      );
    }

    if (def.choice && view === "choose") {
      const choices = Array.isArray(raw) ? raw : [];
      return (
        <div style={S.app}>
          <style>{globalCss}</style>
          {header}
          <main style={S.main}>
            {error && <p style={S.authError}>{error}</p>}
            {raw?.done ? (
              <div style={S.waitCard}>
                <div style={S.startTitle}>Programma completato 🎉</div>
                <p style={S.startMeta}>Hai finito tutte le sessioni di questo programma.</p>
                <button style={S.ghostBtn} onClick={closeSection}><ChevronLeft size={14} /> Torna al menu</button>
              </div>
            ) : choices.length === 0 ? (
              <div style={S.waitCard}>
                <div style={S.startTitle}>Nessun {def.label.toLowerCase()} assegnato</div>
                <p style={S.startMeta}>Il tuo allenatore non te l'ha ancora assegnato.</p>
                <button style={S.ghostBtn} onClick={closeSection}><ChevronLeft size={14} /> Torna al menu</button>
              </div>
            ) : (
              <>
                <div style={S.sectionRow}>
                  <div>
                    <h2 style={S.h2}>Scegli quale {def.label.toLowerCase()} fare</h2>
                    <p style={S.muted}>Finché non le risolvi tutte (fatte o scartate) restano queste — scartarne una la rimanda in fondo, non la perdi.</p>
                  </div>
                  <button style={S.ghostBtn} onClick={closeSection}><ChevronLeft size={14} /> Indietro</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {choices.map((w) => (
                    <div key={w.id} style={S.card}>
                      <div style={{ flex: 1 }}>
                        <div style={S.cardTitle}>{w.name}</div>
                      </div>
                      <div style={{ ...S.cardActions, gap: 8 }}>
                        <button style={S.ghostBtn} onClick={() => discardCandidate(def, w)} disabled={discardingId === w.id}>
                          {discardingId === w.id ? "…" : <><SkipForward size={14} /> Scarta</>}
                        </button>
                        <button style={S.primaryBtn} onClick={() => chooseCandidate(w)}>Visualizza</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </main>
        </div>
      );
    }

    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        {header}
        <main style={S.main}>
          {error && <p style={S.authError}>{error}</p>}
          {workout && !workout.done ? (
            <Preview workout={workout} onStart={() => setView("play")} onBack={def.choice ? () => setView("choose") : closeSection} />
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
                const choices = def.choice && Array.isArray(w) ? w : null;
                const statusText = !w
                  ? "Non assegnato"
                  : w.done
                  ? "Programma completato"
                  : choices
                  ? `${choices.length} session${choices.length === 1 ? "e" : "i"} tra cui scegliere`
                  : w.name;
                const canGo = w && !w.done && (!choices || choices.length > 0);
                return (
                  <div key={def.key} style={S.card}>
                    <div style={{ flex: 1 }}>
                      <div style={S.cardTitle}><def.icon size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{def.label}</div>
                      <div style={S.cardMeta}><span>{statusText}</span></div>
                    </div>
                    <div style={S.cardActions}>
                      {canGo && <button style={S.primaryBtn} onClick={() => openPreview(def.key)}>Vai</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={S.ghostBtn} onClick={backToLanding}><Home size={14} /> Home</button>
          <button style={S.ghostBtn} onClick={() => setShowProfile(true)}><User size={14} /> Profilo</button>
          <button style={S.ghostBtn} onClick={() => setEditingQuestionnaire(true)}><Edit3 size={14} /> Modifica questionario</button>
        </div>
      </main>
    </div>
  );
}
