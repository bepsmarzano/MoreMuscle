import { useState } from "react";
import { Plus, Trash2, X, Library, Search } from "lucide-react";
import { S, ExGif, uid } from "../shared/ui.jsx";

// ---------------------------------------------------------------------------
// Editor di contenuto condivisi tra Riscaldamenti (WarmupLibrary), Programmi
// Circuito (CircuitPrograms) e Programmi Forza (StrengthPrograms): editare
// "un blocco standard" o "una sessione Forza" è sempre lo stesso problema,
// indipendentemente da dove quel blocco/sessione finisce per essere usato.
// ---------------------------------------------------------------------------

// un esercizio dentro un blocco referenzia la libreria via libId, ma tiene
// una copia di name/gif/equipment (snapshot) + reps/time specifici
export const fromLib = (l) => ({ id: uid(), libId: l.id, name: l.name, gif: l.gif, reps: l.defReps, time: l.defTime, equipment: l.equipment || "bodyweight" });

export function LibraryPicker({ library, onPick, onClose }) {
  const [q, setQ] = useState("");
  const filtered = library.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Scegli dalla libreria</span>
          <button style={S.iconBtnSm} onClick={onClose}><X size={15} /></button>
        </div>
        <div style={{ ...S.searchRow, marginBottom: 12 }}>
          <Search size={16} color="#777" />
          <input style={S.searchInput} placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <div style={S.pickerList}>
          {filtered.map((ex) => (
            <button key={ex.id} style={S.pickerItem} onClick={() => { onPick(ex); onClose(); }}>
              <ExGif src={ex.gif} alt="" style={S.pickerThumb} />
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{ex.name}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{ex.defReps > 1 ? `${ex.defReps} rep` : "hold"} · {ex.defTime}s</div>
              </div>
              <Plus size={16} color="#C1FF72" />
            </button>
          ))}
          {filtered.length === 0 && <p style={{ ...S.muted, textAlign: "center", padding: 20 }}>Nessun esercizio. Aggiungilo prima in Libreria.</p>}
        </div>
      </div>
    </div>
  );
}

// blocco standard: lista di esercizi (pescati dalla libreria) + round.
// Usato per un Riscaldamento intero e per ogni sessione di un Programma Circuito.
export function StandardBlockEditor({ block, onPatch, library }) {
  const [picker, setPicker] = useState(false);
  const exercises = block.exercises || [];

  const addFromLib = (libEx) => onPatch({ exercises: [...exercises, fromLib(libEx)] });
  const updateExercise = (ei, patch) => onPatch({ exercises: exercises.map((e, i) => (i === ei ? { ...e, ...patch } : e)) });
  const removeExercise = (ei) => onPatch({ exercises: exercises.filter((_, i) => i !== ei) });

  return (
    <div>
      <label style={{ ...S.miniLbl, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        round
        <input type="number" min={1} style={S.numInputSm} value={block.rounds || 1}
          onChange={(e) => onPatch({ rounds: Math.max(1, +e.target.value || 1) })} />
      </label>

      {exercises.map((ex, ei) => (
        <div key={ex.id} style={S.exRow}>
          <ExGif src={ex.gif} alt="" style={S.exThumb} />
          <div style={S.exFields}>
            <div style={S.exNameStatic}>{ex.name}</div>
            <div style={S.exNums}>
              <label style={S.miniLbl}>rep
                <input type="number" style={S.numInputSm} value={ex.reps} onChange={(e) => updateExercise(ei, { reps: +e.target.value || 0 })} />
              </label>
              <label style={S.miniLbl}>tempo (s)
                <input type="number" style={S.numInputSm} value={ex.time} onChange={(e) => updateExercise(ei, { time: Math.max(1, +e.target.value || 1) })} />
              </label>
            </div>
          </div>
          <button style={S.iconBtn} onClick={() => removeExercise(ei)}><Trash2 size={15} /></button>
        </div>
      ))}

      <button style={S.dashedBtn} onClick={() => setPicker(true)}><Library size={14} /> Aggiungi dalla libreria</button>

      {picker && <LibraryPicker library={library} onPick={addFromLib} onClose={() => setPicker(false)} />}
    </div>
  );
}

// blocco Forza: un solo esercizio, serie di riscaldamento specifico
// (avvicinamento al peso di lavoro) + serie di lavoro a percentuale del
// massimale. Il peso viene calcolato automaticamente nel Player (percent *
// massimale/100), qui si impostano solo rep/percentuale/tempo — mai un peso
// in kg a mano. Usato per ogni sessione di un Programma Forza.
export function StrengthBlockEditor({ block, onPatch, library }) {
  const [picking, setPicking] = useState(false);
  const warmup = block.warmupSets || [];
  const work = block.workSets || [];

  const updateWarmup = (i, patch) => onPatch({ warmupSets: warmup.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addWarmup = () => onPatch({ warmupSets: [...warmup, { reps: 8, note: "", time: 60 }] });
  const removeWarmup = (i) => onPatch({ warmupSets: warmup.filter((_, idx) => idx !== i) });

  const updateWork = (i, patch) => onPatch({ workSets: work.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const addWork = () => onPatch({ workSets: [...work, { reps: 5, percent: 70, time: 180, amrap: false }] });
  const removeWork = (i) => onPatch({ workSets: work.filter((_, idx) => idx !== i) });

  return (
    <div>
      <ExGif src={block.exerciseGif} alt="" style={S.modalPreview} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={S.fieldLbl}>Esercizio</div>
          <div style={S.exNameStatic}>{block.exerciseName || "Nessuno selezionato"}</div>
        </div>
        <button style={S.ghostBtn} onClick={() => setPicking(true)}><Library size={14} /> Scegli dalla libreria</button>
      </div>
      <label style={S.fieldLbl}>Chiave massimale</label>
      <input style={S.fieldInput} value={block.liftKey || ""} placeholder="es. back_squat" onChange={(e) => onPatch({ liftKey: e.target.value })} />
      <p style={{ ...S.muted, marginTop: 4, marginBottom: 14 }}>
        La "chiave massimale" collega questa sessione al massimale dell'atleta (impostato dal pannello Atleti). Usa la stessa chiave per lo stesso sollevamento in tutte le sessioni del programma.
      </p>

      <div style={S.blockLabel}>RISCALDAMENTO SPECIFICO</div>
      {warmup.map((s, i) => (
        <div key={i} style={S.exRow}>
          <div style={S.exFields}>
            <div style={S.exNums}>
              <label style={S.miniLbl}>rep
                <input type="number" style={S.numInputSm} value={s.reps} onChange={(e) => updateWarmup(i, { reps: +e.target.value || 0 })} />
              </label>
              <label style={S.miniLbl}>tempo (s)
                <input type="number" style={S.numInputSm} value={s.time} onChange={(e) => updateWarmup(i, { time: Math.max(1, +e.target.value || 1) })} />
              </label>
            </div>
            <input style={{ ...S.fieldInput, marginTop: 6 }} placeholder="Nota (es. bilanciere vuoto, peso leggero…)"
              value={s.note || ""} onChange={(e) => updateWarmup(i, { note: e.target.value })} />
          </div>
          <button style={S.iconBtn} onClick={() => removeWarmup(i)}><X size={15} /></button>
        </div>
      ))}
      <button style={S.dashedBtn} onClick={addWarmup}><Plus size={14} /> Aggiungi serie riscaldamento</button>

      <div style={{ ...S.blockLabel, marginTop: 18, display: "block" }}>SERIE DI LAVORO</div>
      {work.map((s, i) => (
        <div key={i} style={S.exRow}>
          <div style={S.exFields}>
            <div style={S.exNums}>
              <label style={S.miniLbl}>rep
                <input type="number" style={S.numInputSm} value={s.amrap ? "" : (s.reps ?? "")} disabled={s.amrap}
                  placeholder={s.amrap ? "max" : ""} onChange={(e) => updateWork(i, { reps: +e.target.value || 0 })} />
              </label>
              <label style={S.miniLbl}>% massimale
                <input type="number" style={S.numInputSm} value={s.percent ?? ""} onChange={(e) => updateWork(i, { percent: +e.target.value || 0 })} />
              </label>
              <label style={S.miniLbl}>tempo (s)
                <input type="number" style={S.numInputSm} value={s.time} onChange={(e) => updateWork(i, { time: Math.max(1, +e.target.value || 1) })} />
              </label>
            </div>
            <label style={{ ...S.miniLbl, display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <input type="checkbox" checked={!!s.amrap}
                onChange={(e) => updateWork(i, { amrap: e.target.checked, reps: e.target.checked ? null : (s.reps || 5) })} />
              Max ripetizioni (AMRAP) — l'atleta annota quante ne ha fatte
            </label>
          </div>
          <button style={S.iconBtn} onClick={() => removeWork(i)}><X size={15} /></button>
        </div>
      ))}
      <button style={S.dashedBtn} onClick={addWork}><Plus size={14} /> Aggiungi serie di lavoro</button>

      {picking && (
        <LibraryPicker
          library={library}
          onPick={(libEx) => onPatch({ exerciseName: libEx.name, exerciseGif: libEx.gif, libId: libEx.id })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
