import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipForward, SkipBack, ChevronLeft, Clock, Dumbbell, X, RotateCcw, Volume2, VolumeX, Check } from "lucide-react";
import { S, ExGif } from "../shared/ui.jsx";

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

const LOAD_LEVELS = ["Molto leggero", "Leggero", "Moderato", "Pesante", "Molto pesante"];

export function buildSequence(w, maxesByLiftKey = {}) {
  const steps = [];
  w.blocks.forEach((block, bi) => {
    if (block.type === "strength") {
      const max = block.liftKey ? maxesByLiftKey[block.liftKey] : null;
      const warmup = block.warmupSets || [];
      const work = block.workSets || [];
      warmup.forEach((set, i) => {
        steps.push({
          type: "strength", phase: "warmup", setIndex: i + 1, totalSets: warmup.length,
          amrap: false, percent: null, note: set.note || null, kg: null, blockIndex: bi,
          ex: { name: block.exerciseName, gif: block.exerciseGif, reps: set.reps, time: set.time },
        });
      });
      work.forEach((set, i) => {
        const kg = max && set.percent != null ? Math.round((max * set.percent) / 100) : null;
        steps.push({
          type: "strength", phase: "work", setIndex: i + 1, totalSets: work.length,
          amrap: !!set.amrap, percent: set.percent ?? null, note: null, kg, blockIndex: bi,
          ex: { name: block.exerciseName, gif: block.exerciseGif, reps: set.reps, time: set.time },
        });
      });
    } else {
      const rounds = Math.max(1, block.rounds || 1);
      for (let r = 0; r < rounds; r++) {
        block.exercises.forEach((ex) => steps.push({ type: "exercise", ex, blockIndex: bi, round: r + 1, totalRounds: rounds }));
      }
    }
    if (bi < w.blocks.length - 1) steps.push({ type: "rest", duration: w.restBetweenBlocks, blockIndex: bi });
  });
  return steps;
}

// una serie AMRAP di Forza (rep da annotare) o un esercizio a manubri/kettlebell
// del Circuito (livello di carico da annotare) chiedono un'annotazione a fine step
function needsLog(step) {
  if (!step || step.type === "rest") return null;
  if (step.type === "strength" && step.amrap) return { kind: "reps" };
  if (step.type === "exercise" && step.ex.equipment && step.ex.equipment !== "bodyweight") return { kind: "load" };
  return null;
}

// Sintesi vocale del browser (Web Speech API). Un contatore "generazione"
// invalida qualunque utterance precedente ancora in corso quando arriva un
// nuovo annuncio: quando cancel() interrompe un'utterance con onend
// agganciato, molti browser sparano comunque "end" per quella interrotta, e
// senza questo controllo l'annuncio vecchio continua a parlare
// sovrapponendosi/ripetendo quello nuovo.
function useSpeech(enabled) {
  const genRef = useRef(0);

  return useCallback((text) => {
    if (!enabled || !text || typeof window === "undefined" || !window.speechSynthesis) return;
    const myGen = ++genRef.current;
    window.speechSynthesis.cancel();
    setTimeout(() => {
      if (myGen !== genRef.current) return; // superata da un annuncio più recente
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "it-IT";
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    }, 30);
  }, [enabled]);
}

// ---- PREVIEW ---------------------------------------------------------------
export function Preview({ workout, onStart, onBack }) {
  return (
    <div>
      <div style={S.sectionRow}>
        <div>
          <h2 style={S.h2}>{workout.name}</h2>
          <p style={S.muted}>Anteprima esercizi · riposo {workout.restBetweenBlocks}s tra i blocchi</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {onBack && <button style={S.ghostBtn} onClick={onBack}><ChevronLeft size={16} /> Indietro</button>}
          <button style={S.primaryBtnLg} onClick={onStart}><Play size={18} /> Inizia</button>
        </div>
      </div>

      {workout.blocks.map((block, bi) => (
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
                    <div style={S.previewMeta}>{ex.reps > 1 ? `${ex.reps} rep` : "hold"} · {ex.time}s</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {bi < workout.blocks.length - 1 && <div style={S.restPill}><Clock size={14} /> Riposo {workout.restBetweenBlocks}s</div>}
        </div>
      ))}
    </div>
  );
}

// ---- PLAYER ----------------------------------------------------------------
// onLog({ exerciseName, reps }) o ({ exerciseName, loadLabel }) — chiamato
// quando l'atleta annota una serie AMRAP di Forza o il carico usato in un
// esercizio a manubri/kettlebell del Circuito. maxesByLiftKey: { [liftKey]:
// kg } dei massimali noti, per calcolare i pesi di lavoro della Forza.
export function Player({ workout, onExit, onLog, onFinish, maxesByLiftKey = {} }) {
  const sequence = useRef(buildSequence(workout, maxesByLiftKey)).current;
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(sequence[0]?.type === "rest" ? 0 : (sequence[0]?.ex?.time ?? 0));
  const [running, setRunning] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [started, setStarted] = useState(false);
  const [pendingLog, setPendingLog] = useState(null); // { kind: "reps"|"load", stepIndex }
  const [repsInput, setRepsInput] = useState("");
  const speak = useSpeech(voiceOn);
  const announced10 = useRef(false);

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
      parts.push(s.amrap ? "Massime ripetizioni possibili." : (s.ex.reps > 1 ? `Fai ${s.ex.reps} ripetizioni.` : ""));
      speak(parts.filter(Boolean).join(" "));
      return;
    }
    speak(`${s.ex.name}. ${s.ex.reps > 1 ? `Fai ${s.ex.reps} ripetizioni.` : "Mantieni la posizione."}`);
  }, [sequence, speak]);

  const start = () => {
    setStarted(true); setRunning(true);
    speak("Let's go!");
    setTimeout(() => announceStep(0), 2200);
  };

  const goTo = useCallback((i) => {
    if (i < 0 || i >= sequence.length) return;
    const s = sequence[i];
    announced10.current = false;
    setIdx(i);
    setRemaining(s.type === "rest" ? 0 : s.ex.time);
    if (started) announceStep(i);
  }, [sequence, started, announceStep]);

  // chiamato dal form di annotazione (rep AMRAP o livello di carico): salva,
  // poi riprende dallo step successivo (o chiude l'allenamento se era l'ultimo)
  const resolveLog = (value) => {
    const s = sequence[pendingLog.stepIndex];
    if (pendingLog.kind === "reps") onLog?.({ exerciseName: s.ex.name, reps: Number(value) || 0 });
    else onLog?.({ exerciseName: s.ex.name, loadLabel: value });
    setPendingLog(null);
    setRepsInput("");
    const next = pendingLog.stepIndex + 1;
    if (next < sequence.length) { goTo(next); setRunning(true); }
    else { setRunning(false); speak("Allenamento completato. Ottimo lavoro."); }
  };

  useEffect(() => {
    if (!running || !started) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        const current = sequence[idx];
        // il riposo è un cronometro che conta in su senza limite: l'atleta
        // preme "avanti" quando è pronto (nessun avviso "10 secondi", nessun
        // avanzamento automatico — vedi SkipForward più sotto).
        if (current?.type === "rest") return r + 1;

        if (r === 11 && !announced10.current && idx + 1 < sequence.length) {
          announced10.current = true; speak("Mancano 10 secondi.");
        }
        if (r <= 1) {
          const log = needsLog(current);
          if (log) {
            setPendingLog({ ...log, stepIndex: idx });
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
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, started, idx, sequence, speak, announceStep]);

  const finished = started && !running && !pendingLog && idx === sequence.length - 1 && remaining === 0;

  // notifica il chiamante una volta per ogni allenamento completato (es.
  // l'atleta: avanza alla sessione successiva del piano). Se rifà
  // l'allenamento (Rifai) e lo riporta a termine, scatta di nuovo.
  useEffect(() => {
    if (finished) onFinish?.();
  }, [finished, onFinish]);
  // durante il riposo non c'è un target fisso da riempire: l'anello fa uno
  // "sweep" continuo di 60s (come una lancetta dei secondi) invece di
  // avvicinarsi a un traguardo che non esiste più.
  const progress = isRest ? ((remaining % 60) / 60) * 100 : (total > 0 ? ((total - remaining) / total) * 100 : 0);

  if (!started) {
    return (
      <div style={S.playerFull}>
        <div style={S.startCard}>
          <div style={S.logoMarkBig}><Dumbbell size={28} /></div>
          <div style={S.startTitle}>{workout.name}</div>
          <div style={S.startMeta}>{sequence.filter((s) => s.type === "exercise").length} esercizi · {workout.blocks.length} blocchi</div>
          <button style={S.startBtn} onClick={start}><Play size={20} /> Sta per iniziare</button>
          <button style={S.ghostBtn} onClick={onExit}><ChevronLeft size={16} /> Torna all'anteprima</button>
        </div>
      </div>
    );
  }

  if (finished) {
    return (
      <div style={S.playerFull}>
        <div style={S.startCard}>
          <div style={S.startTitle}>Completato 🔥</div>
          <div style={S.startMeta}>Ottimo lavoro.</div>
          <button style={S.startBtn} onClick={() => { goTo(0); setRunning(false); }}><RotateCcw size={18} /> Rifai</button>
          <button style={S.ghostBtn} onClick={onExit}><ChevronLeft size={16} /> Esci</button>
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
          <ExGif src={step.ex.gif} alt={step.ex.name} style={S.stageMedia} />
        )}
        <div style={S.stageScrimTop} />
        <div style={S.stageScrimBottom} />

        <div style={S.stageTopArea}>
          <div style={{ ...S.stageTopRow, justifyContent: isRest ? "flex-end" : "space-between" }}>
            {!isRest && (
              <div style={S.exBlockTag}>
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
                <text x="38" y="44" textAnchor="middle" fill="#fff" fontSize="21" fontWeight="700" fontFamily="system-ui">{remaining}</text>
              </svg>
            </div>
            {isRest ? (
              <div style={S.restSub}>
                Riposo consigliato {step.duration}s · Blocco {step.blockIndex + 2} in arrivo — premi avanti quando sei pronto
              </div>
            ) : isStrength ? (
              <div style={S.exStageReps}>
                {[
                  step.amrap ? "Max rep" : (step.ex.reps > 1 ? `${step.ex.reps} rep` : ""),
                  step.percent != null ? `${step.percent}%${step.kg != null ? ` (~${step.kg}kg)` : ""}` : null,
                  step.note || null,
                ].filter(Boolean).join(" · ")}
              </div>
            ) : (
              <div style={S.exStageReps}>{step.ex.reps > 1 ? `Fai ${step.ex.reps} rep` : "Mantieni la posizione"}</div>
            )}
          </div>
        </div>

        <div style={S.stageBottomBar}>
          <div style={S.stepDots}>
            {sequence.map((s, i) => (
              <div key={i} style={{ ...S.dot, background: i < idx ? "#C1FF72" : i === idx ? "#fff" : "rgba(255,255,255,.3)", width: s.type === "rest" ? 8 : 14 }} />
            ))}
          </div>
          <div style={S.controls}>
            <button style={S.ctrlBtn} onClick={() => goTo(idx - 1)} disabled={idx === 0 || !!pendingLog}><SkipBack size={22} /></button>
            <button style={S.ctrlBtnMain} onClick={() => setRunning((r) => !r)} disabled={!!pendingLog}>{running ? <Pause size={30} /> : <Play size={30} />}</button>
            <button style={S.ctrlBtn} onClick={() => goTo(idx + 1)} disabled={idx >= sequence.length - 1 || !!pendingLog}><SkipForward size={22} /></button>
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
              <span style={S.modalTitle}>{pendingLog.kind === "reps" ? "Quante ripetizioni hai fatto?" : "Che carico hai usato?"}</span>
            </div>
            {pendingLog.kind === "reps" ? (
              <>
                <input type="number" min={0} autoFocus style={S.fieldInput} value={repsInput}
                  onChange={(e) => setRepsInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && resolveLog(repsInput)} />
                <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 14 }} onClick={() => resolveLog(repsInput)}>
                  <Check size={16} /> Continua
                </button>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {LOAD_LEVELS.map((lvl) => (
                  <button key={lvl} style={S.dashedBtn} onClick={() => resolveLog(lvl)}>{lvl}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
