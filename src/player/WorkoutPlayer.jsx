import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipForward, SkipBack, ChevronLeft, Clock, Dumbbell, X, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { S, ExGif } from "../shared/ui.jsx";

// ---------------------------------------------------------------------------
// Modulo "esegui un allenamento": Preview (griglia esercizi) + Player
// (schermo intero, countdown, voce). Usato identico sia dall'admin (per
// testare un allenamento appena creato) sia dall'atleta (per allenarsi).
// ---------------------------------------------------------------------------

export function buildSequence(w) {
  const steps = [];
  w.blocks.forEach((block, bi) => {
    const rounds = Math.max(1, block.rounds || 1);
    for (let r = 0; r < rounds; r++) {
      block.exercises.forEach((ex) => steps.push({ type: "exercise", ex, blockIndex: bi, round: r + 1, totalRounds: rounds }));
    }
    if (bi < w.blocks.length - 1) steps.push({ type: "rest", duration: w.restBetweenBlocks, blockIndex: bi });
  });
  return steps;
}

function useSpeech(enabled) {
  return useCallback((text) => {
    if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "it-IT"; u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
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
          <div style={S.previewBlockLabel}>BLOCCO {bi + 1}{block.rounds > 1 ? ` · ${block.rounds} round` : ""}</div>
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
          {bi < workout.blocks.length - 1 && <div style={S.restPill}><Clock size={14} /> Riposo {workout.restBetweenBlocks}s</div>}
        </div>
      ))}
    </div>
  );
}

// ---- PLAYER ----------------------------------------------------------------
export function Player({ workout, onExit }) {
  const sequence = useRef(buildSequence(workout)).current;
  const [idx, setIdx] = useState(0);
  const [remaining, setRemaining] = useState(sequence[0]?.duration ?? sequence[0]?.ex?.time ?? 0);
  const [running, setRunning] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [started, setStarted] = useState(false);
  const speak = useSpeech(voiceOn);
  const announced10 = useRef(false);

  const step = sequence[idx];
  const isRest = step?.type === "rest";
  const total = isRest ? step.duration : step.ex.time;

  const announceStep = useCallback((i) => {
    const s = sequence[i];
    if (!s) return;
    if (s.type === "rest") speak("Riposo. Due minuti.");
    else speak(`${s.ex.name}. ${s.ex.reps > 1 ? `Fai ${s.ex.reps} ripetizioni.` : "Mantieni la posizione."}`);
  }, [sequence, speak]);

  const start = () => {
    setStarted(true); setRunning(true);
    speak("Sta per iniziare il tuo more muscle.");
    setTimeout(() => announceStep(0), 2200);
  };

  const goTo = useCallback((i) => {
    if (i < 0 || i >= sequence.length) return;
    const s = sequence[i];
    announced10.current = false;
    setIdx(i);
    setRemaining(s.type === "rest" ? s.duration : s.ex.time);
    if (started) announceStep(i);
  }, [sequence, started, announceStep]);

  useEffect(() => {
    if (!running || !started) return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r === 11 && !announced10.current && idx + 1 < sequence.length) {
          announced10.current = true; speak("Mancano 10 secondi.");
        }
        if (r <= 1) {
          const next = idx + 1;
          if (next < sequence.length) {
            announced10.current = false; setIdx(next);
            const s = sequence[next]; announceStep(next);
            return s.type === "rest" ? s.duration : s.ex.time;
          } else { setRunning(false); speak("Allenamento completato. Ottimo lavoro."); return 0; }
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, started, idx, sequence, speak, announceStep]);

  const finished = started && !running && idx === sequence.length - 1 && remaining === 0;
  const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;

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
                BLOCCO {step.blockIndex + 1}{step.totalRounds > 1 ? ` · Round ${step.round}/${step.totalRounds}` : ""}
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
            {isRest
              ? <div style={S.restSub}>Blocco {step.blockIndex + 2} in arrivo</div>
              : <div style={S.exStageReps}>{step.ex.reps > 1 ? `Fai ${step.ex.reps} rep` : "Mantieni la posizione"}</div>}
          </div>
        </div>

        <div style={S.stageBottomBar}>
          <div style={S.stepDots}>
            {sequence.map((s, i) => (
              <div key={i} style={{ ...S.dot, background: i < idx ? "#C1FF72" : i === idx ? "#fff" : "rgba(255,255,255,.3)", width: s.type === "rest" ? 8 : 14 }} />
            ))}
          </div>
          <div style={S.controls}>
            <button style={S.ctrlBtn} onClick={() => goTo(idx - 1)} disabled={idx === 0}><SkipBack size={22} /></button>
            <button style={S.ctrlBtnMain} onClick={() => setRunning((r) => !r)}>{running ? <Pause size={30} /> : <Play size={30} />}</button>
            <button style={S.ctrlBtn} onClick={() => goTo(idx + 1)} disabled={idx >= sequence.length - 1}><SkipForward size={22} /></button>
          </div>

          <div style={S.playerFooter}>
            <button style={S.footBtn} onClick={() => setVoiceOn((v) => !v)}>{voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />} {voiceOn ? "Voce on" : "Voce off"}</button>
            <span style={S.stepCount}>{idx + 1} / {sequence.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
