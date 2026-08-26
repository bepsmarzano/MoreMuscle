import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipForward, SkipBack, ChevronLeft, Clock, X, RotateCcw, Volume2, VolumeX, Check, Home } from "lucide-react";
import { S, ExGif, LOAD_LEVELS } from "../shared/ui.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Modulo "esegui un allenamento": Preview (griglia esercizi) + Player
// (schermo intero, countdown, voce). Usato identico sia dall'admin (per
// testare un allenamento appena creato) sia dall'atleta (per allenarsi).
//
// Due tipi di blocco: "standard" (riscaldamento/circuito, di sempre — N
// esercizi con GIF, ripetuti per `rounds`) e "strength" (Forza — un solo
// esercizio, serie di riscaldamento specifico + serie di lavoro a
// percentuale del massimale, calcolata automaticamente).
// ---------------------------------------------------------------------------

// un blocco "vuoto" (es. il secondo blocco di una sessione Circuito creata
// con un solo blocco davvero compilato — vedi CircuitPrograms.jsx) non deve
// generare un riposo prima di sé: non c'è nulla per cui aspettare.
function blockHasContent(block) {
  if (!block) return false;
  if (block.type === "strength") return (block.warmupSets?.length || 0) + (block.workSets?.length || 0) > 0;
  return (block.exercises?.length || 0) > 0;
}

export function buildSequence(w, maxesByLiftKey = {}) {
  const steps = [];
  w.blocks.forEach((block, bi) => {
    if (block.type === "strength") {
      // il massimale è collegato tramite l'id dell'esercizio scelto dalla
      // libreria (block.libId) — niente più chiave scritta a mano da tenere
      // allineata tra le sessioni.
      const max = block.libId ? maxesByLiftKey[block.libId] : null;
      const warmup = block.warmupSets || [];
      const work = block.workSets || [];
      warmup.forEach((set, i) => {
        steps.push({
          type: "strength", phase: "warmup", setIndex: i + 1, totalSets: warmup.length,
          percent: null, note: set.note || null, kg: null, blockIndex: bi,
          ex: { name: block.exerciseName, gif: block.exerciseGif, reps: set.reps, time: set.time },
        });
      });
      work.forEach((set, i) => {
        const kg = max && set.percent != null ? Math.round((max * set.percent) / 100) : null;
        steps.push({
          type: "strength", phase: "work", setIndex: i + 1, totalSets: work.length,
          percent: set.percent ?? null, note: null, kg, blockIndex: bi,
          ex: { name: block.exerciseName, gif: block.exerciseGif, reps: set.reps, time: set.time },
        });
      });
    } else {
      const rounds = Math.max(1, block.rounds || 1);
      for (let r = 0; r < rounds; r++) {
        block.exercises.forEach((ex) => steps.push({ type: "exercise", ex, blockIndex: bi, round: r + 1, totalRounds: rounds }));
      }
    }
    if (bi < w.blocks.length - 1 && blockHasContent(w.blocks[bi + 1])) steps.push({ type: "rest", duration: w.restBetweenBlocks, blockIndex: bi });
  });
  return steps;
}

// URL di tutte le GIF di un allenamento, per pre-scaricarle prima che
// l'atleta ci arrivi davvero (vedi prefetchGifs in shared/ui.jsx). Riusa
// buildSequence così non deve conoscere di nuovo la forma dei blocchi
// standard/Forza — funziona già per entrambi allo stesso modo.
export function collectGifUrls(w) {
  if (!w || w.done) return [];
  return buildSequence(w).map((s) => s.ex?.gif).filter(Boolean);
}

// "0 rep" = Max (standard o Forza, stessa convenzione: vedi blockEditors.jsx).
// Solo per la Forza le rep effettive contano come dato di allenamento (serve
// per seguire la progressione nel tempo) e si chiedono ancora a posteriori;
// nei Circuiti/Riscaldamento un Max (es. Mountain Climber, Burpees, Plank)
// non si annota più — era un'interruzione non voluta su ogni esercizio Max,
// non solo sui pochi dove aveva senso davvero. Il carico da usare non si
// chiede mai: lo prescrive l'admin in fase di creazione (ex.loadLevel) e
// l'atleta lo vede insieme a nome/rep.
function needsLog(step) {
  if (!step || step.type !== "strength") return null;
  if (step.ex && step.ex.reps === 0) return { kind: "reps" };
  return null;
}

// Progresso salvato sul dispositivo (localStorage): non possiamo far
// continuare l'esecuzione mentre il telefono è bloccato o un'altra app è in
// primo piano (limite di sistema, non aggirabile), ma se il browser scarica
// e ricarica la pagina in background — la causa più comune di "torna sempre
// a zero" — possiamo almeno riprendere da dove eravamo rimasti al rientro.
// Una sola voce salvata alla volta: basta per il caso reale (un solo
// allenamento in corso), non serve tracciarne più d'uno in parallelo.
const RESUME_KEY = "mm_player_progress";
const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000; // oltre le 6 ore non ha senso "riprendere", meglio ripartire

function loadSavedProgress(workoutId) {
  try {
    const saved = JSON.parse(localStorage.getItem(RESUME_KEY) || "null");
    if (!saved || saved.workoutId !== workoutId) return null;
    if (Date.now() - saved.savedAt > RESUME_MAX_AGE_MS) return null;
    return saved;
  } catch {
    return null; // storage non disponibile o dato corrotto: si riparte da capo, non è un errore fatale
  }
}

function saveProgress(workoutId, idx, remaining, pendingLog) {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify({ workoutId, idx, remaining, pendingLog, savedAt: Date.now() }));
  } catch { /* storage pieno/non disponibile: pazienza, si riparte da capo se serve */ }
}

function clearProgress() {
  try { localStorage.removeItem(RESUME_KEY); } catch { /* niente da pulire */ }
}

// Voce ElevenLabs (via api/tts.js, con cache lato server — vedi lì), con
// fallback alla sintesi del browser (Web Speech API) se ElevenLabs non è
// raggiungibile/configurata: l'allenamento non deve mai restare muto per un
// problema di rete o di quota. Un contatore "generazione" invalida qualunque
// annuncio precedente ancora in corso (fetch in volo o utterance) quando ne
// arriva uno nuovo — senza, un fetch lento potrebbe risolversi tardi e far
// partire un annuncio vecchio sopra a quello nuovo.
function useSpeech(enabled) {
  const genRef = useRef(0);
  const audioRef = useRef(null); // <audio> riusato per ogni annuncio ElevenLabs

  const speakBrowser = useCallback((text, myGen) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setTimeout(() => {
      if (myGen !== genRef.current) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "it-IT";
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    }, 30);
  }, []);

  return useCallback((text) => {
    if (!enabled || !text || typeof window === "undefined") return;
    const myGen = ++genRef.current;

    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }

    api.getSpokenAudioUrl(text).then((url) => {
      if (myGen !== genRef.current) return; // superato da un annuncio più recente
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.play().catch(() => { if (myGen === genRef.current) speakBrowser(text, myGen); });
    }).catch(() => {
      if (myGen === genRef.current) speakBrowser(text, myGen); // ElevenLabs non disponibile: rete di sicurezza
    });
  }, [enabled, speakBrowser]);
}

// audio silenzioso minimo (1 sample), usato solo per "sbloccare" la
// riproduzione: un <audio> vero (a differenza della sintesi vocale del
// browser) su molti browser mobile parte solo se play() viene chiamato
// nello stesso gesto utente — qui il primo annuncio arriva dopo una
// richiesta di rete (fetch dell'mp3 ElevenLabs), quindi troppo tardi per
// contare come "dentro" al tap. Riprodurne uno vero (anche silenzioso, anche
// se scartato subito) nel click su "Inizia" sblocca la riproduzione audio
// per il resto della sessione, prima che serva davvero.
const SILENT_AUDIO = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

// bip di conto alla rovescia (solo Circuito, 3 secondi prima del cambio
// esercizio — vedi il tick del Player) — generato al volo con la Web Audio
// API, niente file audio da caricare. Un solo AudioContext riusato per tutti
// i bip; creato/sbloccato nello stesso gesto di "Inizia" (stessa ragione del
// SILENT_AUDIO sopra: creato più tardi rischierebbe di restare sospeso).
let beepCtx = null;
function ensureBeepContext() {
  if (!beepCtx) {
    try { beepCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (beepCtx.state === "suspended") beepCtx.resume().catch(() => {});
  return beepCtx;
}
function beep() {
  const ctx = ensureBeepContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square"; // più squillante/percepibile di sine in un ambiente rumoroso
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.setValueAtTime(0.4, ctx.currentTime + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.21);
  } catch { /* un bip mancato non blocca l'allenamento */ }
}

function unlockAudioPlayback() {
  try { new Audio(SILENT_AUDIO).play().catch(() => {}); } catch { /* niente da fare, si tenterà comunque più tardi */ }
  ensureBeepContext();
}

// ---- PREVIEW ---------------------------------------------------------------
export function Preview({ workout, onStart, onBack }) {
  const start = () => { unlockAudioPlayback(); onStart(); };
  return (
    <div>
      <div style={S.sectionRow}>
        <div>
          <h2 style={S.h2}>{workout.name}</h2>
          <p style={S.muted}>Anteprima esercizi · riposo {workout.restBetweenBlocks}s tra i blocchi</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onBack && <button style={S.ghostBtn} onClick={onBack}><ChevronLeft size={16} /> Indietro</button>}
          <button style={S.primaryBtnLg} onClick={start}><Play size={18} /> Inizia</button>
        </div>
      </div>

      {(() => {
        // blocchi senza contenuto (es. il secondo blocco "vuoto" di un
        // circuito creato con un solo blocco davvero compilato — vedi
        // CircuitPrograms.jsx) non compaiono affatto in anteprima, né generano
        // un riposo dopo di sé: stessa logica di buildSequence, qui applicata
        // prima di sapere quali indici restano "ultimo" tra quelli veri.
        const real = workout.blocks.map((block, bi) => ({ block, bi })).filter(({ block }) => blockHasContent(block));
        return real.map(({ block, bi }, ri) => (
          <div key={block.id} style={{ marginBottom: 24 }}>
            <div style={S.previewBlockLabel}>
              BLOCCO {bi + 1}{block.type !== "strength" && block.rounds > 1 ? ` · ${block.rounds} round` : ""}
            </div>
            {block.type === "strength" ? (
              <div style={S.previewCard}>
                <ExGif src={block.exerciseGif} alt={block.exerciseName} style={S.previewImg} />
                <div style={S.previewInfo}>
                  <div style={S.previewName}>{block.exerciseName || "Senza nome"}</div>
                  <div style={S.previewMeta}>
                    {(block.warmupSets || []).length} serie riscaldamento · {(block.workSets || []).length} serie di lavoro
                  </div>
                </div>
              </div>
            ) : (
              <div style={S.previewGrid}>
                {block.exercises.map((ex) => (
                  <div key={ex.id} style={S.previewCard}>
                    <ExGif src={ex.gif} alt={ex.name} style={S.previewImg} />
                    <div style={S.previewInfo}>
                      <div style={S.previewName}>{ex.name}</div>
                      <div style={S.previewMeta}>
                        {ex.reps === 0 ? "Max" : ex.reps > 1 ? `${ex.reps} rep` : "hold"} · {ex.time}s{ex.loadLevel ? ` · ${ex.loadLevel}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {ri < real.length - 1 && <div style={S.restPill}><Clock size={14} /> Riposo {workout.restBetweenBlocks}s</div>}
          </div>
        ));
      })()}
    </div>
  );
}

// ---- PLAYER ----------------------------------------------------------------
// onLog({ exerciseName, reps }) — chiamato quando l'atleta annota una serie
// Max/AMRAP (standard o Forza). Il carico da usare non si annota più: è
// prescritto dall'admin (ex.loadLevel) e mostrato all'atleta, non chiesto.
// maxesByLiftKey: { [libId esercizio]: kg } dei massimali noti, per
// calcolare i pesi di lavoro della Forza.
// onHome (opzionale): torna dritto al menu principale, non solo all'anteprima
// di questa sezione — un'azione client-side pura, senza chiamate di rete,
// sempre disponibile anche se il completamento della sessione dovesse fallire.
// onGetLastLoadLabels (opzionale, async, nomi esercizio -> {nome: ultimo peso
// annotato}): riferimento mostrato nel riepilogo di fine blocco Circuito.
export function Player({ workout, onExit, onHome, onLog, onGetLastLoadLabels, onFinish, maxesByLiftKey = {} }) {
  const sequence = useRef(buildSequence(workout, maxesByLiftKey)).current;
  // ultimo step (non di riposo) di ogni blocco — serve per sapere, quando un
  // round finisce, se è anche l'ultimo del blocco (quindi il momento giusto
  // per il riepilogo pesi, se il blocco ha esercizi con attrezzo).
  const lastStepOfBlock = useRef((() => {
    const m = new Map();
    sequence.forEach((s, i) => { if (s.type !== "rest") m.set(s.blockIndex, i); });
    return m;
  })()).current;
  const blockEquippedExercises = useCallback((blockIndex) => {
    const block = workout.blocks[blockIndex];
    if (!block || block.type === "strength") return [];
    return (block.exercises || []).filter((e) => e.equipment && e.equipment !== "bodyweight");
  }, [workout.blocks]);

  // letto una volta sola al mount: se combacia con questo stesso allenamento
  // (e non è troppo vecchio) si riprende da lì invece che dall'inizio.
  const saved = useRef(loadSavedProgress(workout.id)).current;
  const [idx, setIdx] = useState(() => Math.min(saved?.idx ?? 0, sequence.length - 1));
  const [remaining, setRemaining] = useState(() => saved?.remaining ?? (sequence[0]?.type === "rest" ? 0 : (sequence[0]?.ex?.time ?? 0)));
  // riprendendo si parte in pausa: l'atleta si riorienta e preme play quando è pronto,
  // invece di ritrovarsi il countdown già in corsa appena riapre l'app.
  const [running, setRunning] = useState(!saved);
  const [voiceOn, setVoiceOn] = useState(true);
  const [pendingLog, setPendingLog] = useState(saved?.pendingLog ?? null); // { kind: "reps", stepIndex } — solo serie Max/AMRAP di Forza
  const [repsInput, setRepsInput] = useState("");
  // { blockIndex, items: [{name, prescribed, chosenLabel, chosenKg}], lastLabels }
  // — riepilogo "che peso hai usato" per gli esercizi con attrezzo di un
  // blocco appena concluso. Non si riprende da localStorage se l'app va in
  // background proprio in questo momento (caso raro): al rientro si
  // ripresenta da solo, perché si ricalcola dallo stesso idx salvato, non
  // serve persisterlo a parte.
  const [blockSummary, setBlockSummary] = useState(null);
  const speak = useSpeech(voiceOn);
  const announced10 = useRef(false);
  const introSpoken = useRef(false);

  const openBlockSummary = useCallback((blockIndex) => {
    const equipped = blockEquippedExercises(blockIndex);
    setBlockSummary({
      blockIndex,
      items: equipped.map((e) => ({ name: e.name, prescribed: e.loadLevel || null, chosenLabel: e.loadLevel || "", chosenKg: "" })),
      lastLabels: {},
    });
    onGetLastLoadLabels?.(equipped.map((e) => e.name)).then((labels) => {
      setBlockSummary((bs) => (bs && bs.blockIndex === blockIndex ? { ...bs, lastLabels: labels || {} } : bs));
    }).catch(() => {}); // solo un riferimento in più: se non arriva, il riepilogo resta comunque compilabile
  }, [blockEquippedExercises, onGetLastLoadLabels]);

  const step = sequence[idx];
  const isRest = step?.type === "rest";
  const isStrength = step?.type === "strength";
  const total = isRest ? step.duration : step.ex.time;

  const announceStep = useCallback((i) => {
    const s = sequence[i];
    if (!s) return;
    if (s.type === "rest") { speak(`Riposo. ${s.duration} secondi consigliati.`); return; }
    if (s.type === "strength") {
      const parts = [s.ex.name];
      parts.push(s.phase === "warmup" ? (s.note ? `Riscaldamento, ${s.note}.` : "Riscaldamento.") : `Serie ${s.setIndex} di ${s.totalSets}.`);
      if (s.percent != null) parts.push(`${s.percent} percento${s.kg != null ? `, ${s.kg} chili.` : "."}`);
      parts.push(s.ex.reps === 0 ? "Massime ripetizioni possibili." : (s.ex.reps > 1 ? `Fai ${s.ex.reps} ripetizioni.` : ""));
      speak(parts.filter(Boolean).join(" "));
      return;
    }
    const tail = s.ex.reps === 0 ? "Fai il massimo numero di ripetizioni possibile." : s.ex.reps > 1 ? `Fai ${s.ex.reps} ripetizioni.` : "Mantieni la posizione.";
    const load = s.ex.loadLevel ? ` Carico: ${s.ex.loadLevel}.` : "";
    speak(`${s.ex.name}. ${tail}${load}`);
  }, [sequence, speak]);

  // annuncio di apertura, una volta sola al mount (il tap su "Inizia" nell'anteprima
  // è già il gesto utente richiesto da iOS per sbloccare la sintesi vocale — non
  // serve più un secondo tap su "Sta per iniziare" dentro al Player). Se si
  // riprende un allenamento salvato, niente "Let's go!": si annuncia subito
  // su cosa si è rimasti, così chi riapre l'app si riorienta senza dover
  // guardare lo schermo.
  useEffect(() => {
    if (introSpoken.current) return;
    introSpoken.current = true;
    if (saved) {
      announceStep(idx);
      return;
    }
    speak("Let's go!");
    const t = setTimeout(() => announceStep(0), 2200);
    return () => clearTimeout(t);
    // eslint: idx/saved letti volutamente solo al mount (guardia introSpoken sopra)
  }, [speak, announceStep]);

  // salva il punto in cui siamo a ogni cambiamento (circa una volta al
  // secondo mentre gira il countdown): se il browser scarica e ricarica la
  // pagina mentre l'app è in background, al ritorno si riprende da qui
  // invece che dall'inizio.
  useEffect(() => {
    saveProgress(workout.id, idx, remaining, pendingLog);
  }, [workout.id, idx, remaining, pendingLog]);

  // schermo sempre acceso finché l'allenamento è a schermo intero — la causa
  // più comune di "l'allenamento si interrompe in background" è lo spegnimento
  // automatico dello schermo per inattività, non l'utente che cambia app di
  // proposito. Il Wake Lock si rilascia da solo quando la scheda va in
  // background (specifica del browser): lo richiediamo di nuovo al ritorno.
  // Non supportato ovunque (es. alcune versioni iOS): fallisce in silenzio,
  // non è un requisito per far funzionare l'allenamento.
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let sentinel = null;
    const acquire = async () => {
      try { sentinel = await navigator.wakeLock.request("screen"); }
      catch { /* niente di grave: lo schermo potrà spegnersi da solo */ }
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, []);

  const goTo = useCallback((i) => {
    if (i < 0 || i >= sequence.length) return;
    const s = sequence[i];
    announced10.current = false;
    setIdx(i);
    setRemaining(s.type === "rest" ? 0 : s.ex.time);
    announceStep(i);
  }, [sequence, announceStep]);

  // avanza oltre lo step appena concluso — condiviso da resolveLog e
  // resolveBlockSummary: se è anche l'ultimo step (non di riposo) del suo
  // blocco, e quel blocco ha esercizi con attrezzo, si ferma prima sul
  // riepilogo pesi invece di proseguire dritto al riposo/blocco successivo.
  const advancePast = useCallback((finishedIdx) => {
    const s = sequence[finishedIdx];
    if (s.type !== "rest" && lastStepOfBlock.get(s.blockIndex) === finishedIdx && blockEquippedExercises(s.blockIndex).length) {
      openBlockSummary(s.blockIndex);
      return;
    }
    const next = finishedIdx + 1;
    if (next < sequence.length) { goTo(next); setRunning(true); }
    else { setRunning(false); speak("Allenamento completato. Ottimo lavoro."); }
  }, [sequence, lastStepOfBlock, blockEquippedExercises, openBlockSummary, goTo, speak]);

  // chiamato dal form di annotazione (rep di una serie Max/AMRAP di Forza):
  // salva, poi riprende dallo step successivo (o dal riepilogo pesi, o
  // chiude l'allenamento se era l'ultimo)
  const resolveLog = (value) => {
    const s = sequence[pendingLog.stepIndex];
    onLog?.({ exerciseName: s.ex.name, reps: Number(value) || 0 });
    const finishedIdx = pendingLog.stepIndex;
    setPendingLog(null);
    setRepsInput("");
    advancePast(finishedIdx);
  };

  // chiamato dal riepilogo di fine blocco: annota il peso scelto (livello +
  // chili esatti, se scritti) per ogni esercizio con attrezzo — solo quelli
  // con almeno una scelta fatta — poi riprende
  const resolveBlockSummary = () => {
    const bs = blockSummary;
    bs.items.forEach((it) => {
      const kg = it.chosenKg !== "" ? Number(it.chosenKg) : null;
      if (it.chosenLabel || kg != null) onLog?.({ exerciseName: it.name, loadLabel: it.chosenLabel || null, weightKg: kg });
    });
    const finishedIdx = lastStepOfBlock.get(bs.blockIndex);
    setBlockSummary(null);
    const next = finishedIdx + 1;
    if (next < sequence.length) { goTo(next); setRunning(true); }
    else { setRunning(false); speak("Allenamento completato. Ottimo lavoro."); }
  };

  // il browser mette in pausa/rallenta i setInterval quando la scheda va in
  // background (schermo spento, altra app in primo piano): un tick non
  // corrisponde più in modo affidabile a "è passato 1 secondo". Misuriamo il
  // tempo reale trascorso dall'ultimo tick e lo usiamo come decremento — così
  // al ritorno il countdown si allinea da solo invece di restare bloccato.
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    if (!running) return;
    lastTickRef.current = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(1, Math.round((now - lastTickRef.current) / 1000));
      lastTickRef.current = now;
      setRemaining((r) => {
        const current = sequence[idx];
        // il riposo è un cronometro che conta in su senza limite: l'atleta
        // preme "avanti" quando è pronto (nessun avviso "10 secondi", nessun
        // avanzamento automatico — vedi SkipForward più sotto).
        if (current?.type === "rest") return r + elapsed;

        if (r === 11 && !announced10.current && idx + 1 < sequence.length) {
          announced10.current = true; speak("Mancano 10 secondi.");
        }
        // 3 bip negli ultimi 3 secondi prima del cambio esercizio, solo nei
        // Circuiti — un modo rapido di sentire "si cambia" senza aspettare
        // la voce, utile per organizzare il cambio di attrezzi.
        if (workout.kind === "circuit" && r >= 1 && r <= 3) beep();
        if (r <= 1) {
          const log = needsLog(current);
          if (log) {
            setPendingLog({ ...log, stepIndex: idx });
            setRunning(false);
            return 0;
          }
          // ultimo step (non di riposo) del suo blocco, e il blocco ha
          // esercizi con attrezzo: riepilogo pesi prima di proseguire
          if (current.type !== "rest" && lastStepOfBlock.get(current.blockIndex) === idx && blockEquippedExercises(current.blockIndex).length) {
            openBlockSummary(current.blockIndex);
            setRunning(false);
            return 0;
          }
          const next = idx + 1;
          if (next < sequence.length) {
            announced10.current = false; setIdx(next);
            const s = sequence[next]; announceStep(next);
            return s.type === "rest" ? 0 : s.ex.time;
          } else { setRunning(false); speak("Allenamento completato. Ottimo lavoro."); return 0; }
        }
        return Math.max(0, r - elapsed);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, idx, sequence, speak, announceStep, lastStepOfBlock, blockEquippedExercises, openBlockSummary]);

  const finished = !running && !pendingLog && !blockSummary && idx === sequence.length - 1 && remaining === 0;

  // notifica il chiamante una volta per ogni allenamento completato (es.
  // l'atleta: avanza alla sessione successiva del piano). Se rifà
  // l'allenamento (Rifai) e lo riporta a termine, scatta di nuovo.
  useEffect(() => {
    if (finished) { onFinish?.(); clearProgress(); }
  }, [finished, onFinish]);
  // durante il riposo non c'è un target fisso da riempire: l'anello fa uno
  // "sweep" continuo di 60s (come una lancetta dei secondi) invece di
  // avvicinarsi a un traguardo che non esiste più.
  const progress = isRest ? ((remaining % 60) / 60) * 100 : (total > 0 ? Math.min(100, ((total - Math.max(0, remaining)) / total) * 100) : 0);

  if (finished) {
    return (
      <div style={S.playerFull}>
        <div style={S.startCard}>
          <div style={S.startTitle}>Completato 🔥</div>
          <div style={S.startMeta}>Ottimo lavoro.</div>
          {/* "Rifai" solo quando non c'è un onFinish reale da richiamare (es.
              test admin): nel flusso atleta rieseguire un allenamento già
              completato non deve essere possibile, e richiamerebbe onFinish
              un'altra volta avanzando il puntatore a sproposito. */}
          {!onFinish && (
            <button style={S.startBtn} onClick={() => { goTo(0); setRunning(false); }}><RotateCcw size={18} /> Rifai</button>
          )}
          {/* qui l'azione utile è tornare al menu, non all'anteprima di una
              sessione appena completata (e già avanzata alla prossima) —
              onHome se disponibile, altrimenti onExit come prima */}
          <button style={S.ghostBtn} onClick={onHome || onExit}><Home size={16} /> Torna alla home</button>
        </div>
      </div>
    );
  }

  return (
    <div style={S.playerFull}>
      <div style={S.stageWrap}>
        {isRest ? (
          <div style={{ ...S.stageMedia, background: "radial-gradient(circle at 50% 40%, #1a2c4a, #05070d)" }} />
        ) : (
          <ExGif src={step.ex.gif} alt={step.ex.name} style={S.stageMedia} fetchPriority="high" />
        )}
        <div style={S.stageScrimTop} />
        <div style={S.stageScrimBottom} />

        <div style={S.stageTopArea}>
          <div style={{ ...S.stageTopRow, position: "relative", justifyContent: "flex-end" }}>
            {/* centrata sull'intera larghezza della pagina (position:absolute
                + left:50%), non solo sullo spazio libero accanto alla X — la
                X resta fissa in alto a destra indipendentemente */}
            {!isRest && (
              <div style={{ ...S.exBlockTag, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
                BLOCCO {step.blockIndex + 1}
                {isStrength
                  ? ` · ${step.phase === "warmup" ? "Risc." : "Serie"} ${step.setIndex}/${step.totalSets}`
                  : (step.totalRounds > 1 ? ` · Round ${step.round}/${step.totalRounds}` : "")}
              </div>
            )}
            <button style={S.exitBtnOverlay} onClick={onExit}><X size={18} /></button>
          </div>

          <div style={S.stageNameRow}>
            {isRest ? <div style={S.restBig}>RIPOSO</div> : <div style={S.exStageName}>{step.ex.name}</div>}
          </div>

          <div style={S.stageTimerRow}>
            {/* countdown in sovrimpressione, dentro il video */}
            <div style={S.timerBackdrop}>
              <svg width="76" height="76" viewBox="0 0 76 76">
                <circle cx="38" cy="38" r="31" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="6" />
                <circle cx="38" cy="38" r="31" fill="none" stroke={isRest ? "#3b82f6" : "#C1FF72"} strokeWidth="6"
                  strokeLinecap="round" strokeDasharray={2 * Math.PI * 31}
                  strokeDashoffset={(2 * Math.PI * 31) * (1 - progress / 100)}
                  transform="rotate(-90 38 38)" style={{ transition: "stroke-dashoffset 1s linear" }} />
                <text x="38" y="44" textAnchor="middle" fill="#fff" fontSize="21" fontWeight="700" fontFamily="system-ui">{Math.max(0, remaining)}</text>
              </svg>
            </div>
            {isRest ? (
              <div style={S.restSub}>
                Riposo consigliato {step.duration}s · Blocco {step.blockIndex + 2} in arrivo — premi avanti quando sei pronto
              </div>
            ) : isStrength ? (
              <div style={S.exStageReps}>
                {[
                  step.ex.reps === 0 ? "Max rep" : (step.ex.reps > 1 ? `${step.ex.reps} rep` : ""),
                  step.percent != null ? `${step.percent}%${step.kg != null ? ` (~${step.kg}kg)` : ""}` : null,
                  step.note || null,
                ].filter(Boolean).join(" · ")}
              </div>
            ) : (
              <div style={S.exStageReps}>
                {[
                  step.ex.reps === 0 ? "Fai il massimo numero di rep" : step.ex.reps > 1 ? `Fai ${step.ex.reps} rep` : "Mantieni la posizione",
                  step.ex.loadLevel ? `Carico: ${step.ex.loadLevel}` : null,
                ].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>

          {/* durante il riposo, un'anteprima del blocco che sta per iniziare
              — così l'atleta organizza il cambio di attrezzi mentre aspetta,
              invece di scoprirlo esercizio per esercizio */}
          {isRest && (() => {
            const nextBlock = workout.blocks[step.blockIndex + 1];
            if (!nextBlock || nextBlock.type === "strength" || !(nextBlock.exercises || []).length) return null;
            return (
              <div style={S.restPreviewRow}>
                {nextBlock.exercises.map((ex) => (
                  <div key={ex.id} style={S.restPreviewItem}>
                    <ExGif src={ex.gif} alt={ex.name} style={S.restPreviewImg} />
                    <div style={S.restPreviewName}>{ex.name}</div>
                    {ex.loadLevel && <div style={S.restPreviewLoad}>{ex.loadLevel}</div>}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        <div style={S.stageBottomBar}>
          <div style={S.stepDots}>
            {sequence.map((s, i) => (
              <div key={i} style={{ ...S.dot, background: i < idx ? "#C1FF72" : i === idx ? "#fff" : "rgba(255,255,255,.3)", width: s.type === "rest" ? 8 : 14 }} />
            ))}
          </div>
          <div style={S.controls}>
            <button style={S.ctrlBtn} onClick={() => goTo(idx - 1)} disabled={idx === 0 || !!pendingLog || !!blockSummary}><SkipBack size={22} /></button>
            <button style={S.ctrlBtnMain} onClick={() => setRunning((r) => !r)} disabled={!!pendingLog || !!blockSummary}>{running ? <Pause size={30} /> : <Play size={30} />}</button>
            <button style={S.ctrlBtn} onClick={() => goTo(idx + 1)} disabled={idx >= sequence.length - 1 || !!pendingLog || !!blockSummary}><SkipForward size={22} /></button>
          </div>

          <div style={S.playerFooter}>
            <button style={S.footBtn} onClick={() => setVoiceOn((v) => !v)}>{voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />} {voiceOn ? "Voce on" : "Voce off"}</button>
            <span style={S.stepCount}>{idx + 1} / {sequence.length}</span>
          </div>
        </div>
      </div>

      {pendingLog && (
        <div style={S.modalWrap}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Quante ripetizioni hai fatto?</span>
            </div>
            <input type="number" min={0} autoFocus style={S.fieldInput} value={repsInput}
              onChange={(e) => setRepsInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && resolveLog(repsInput)} />
            <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 14 }} onClick={() => resolveLog(repsInput)}>
              <Check size={16} /> Continua
            </button>
          </div>
        </div>
      )}

      {blockSummary && (
        <div style={S.modalWrap}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <span style={S.modalTitle}>Che peso hai usato?</span>
            </div>
            <p style={{ ...S.muted, marginTop: -6, marginBottom: 14 }}>Blocco {blockSummary.blockIndex + 1} completato — un ricordo veloce per la prossima volta.</p>
            {blockSummary.items.map((it, i) => {
              const last = blockSummary.lastLabels[it.name];
              const lastText = last && [last.loadLabel, last.weightKg != null ? `${last.weightKg}kg` : null].filter(Boolean).join(", ");
              const patchItem = (patch) => setBlockSummary((bs) => ({ ...bs, items: bs.items.map((x, xi) => (xi === i ? { ...x, ...patch } : x)) }));
              return (
                <div key={it.name} style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{it.name}</div>
                  {lastText && <div style={{ ...S.muted, fontSize: 12, marginBottom: 6 }}>La volta scorsa: {lastText}</div>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <select style={{ ...S.fieldInput, flex: 1 }} value={it.chosenLabel}
                      onChange={(e) => patchItem({ chosenLabel: e.target.value })}>
                      <option value="">— livello —</option>
                      {LOAD_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                    </select>
                    <input type="number" min={0} step="0.5" placeholder="kg" style={{ ...S.fieldInput, width: 80 }}
                      value={it.chosenKg} onChange={(e) => patchItem({ chosenKg: e.target.value })} />
                  </div>
                </div>
              );
            })}
            <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 4 }} onClick={resolveBlockSummary}>
              <Check size={16} /> Continua
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
