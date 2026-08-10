import { useState, useEffect } from "react";
import { Plus, Trash2, Edit3, X, Check, ChevronUp, ChevronDown, Play } from "lucide-react";
import { S } from "../shared/ui.jsx";
import { Preview, Player } from "../player/WorkoutPlayer.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Un piano combina: riscaldamenti in rotazione fissa + 1 Programma Forza +
// 1 Programma Circuito + riposo tra blocchi. La sessione N si assembla al
// volo (vedi api.getCurrentSession) — qui si sceglie solo la composizione.
// ---------------------------------------------------------------------------
export default function PlanBuilder() {
  const [plans, setPlans] = useState([]);
  const [warmups, setWarmups] = useState([]);
  const [strengthPrograms, setStrengthPrograms] = useState([]);
  const [circuitPrograms, setCircuitPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pl, w, sp, cp] = await Promise.all([
        api.listPlans(), api.listWarmupBlocks(), api.listStrengthPrograms(), api.listCircuitPrograms(),
      ]);
      setPlans(pl); setWarmups(w); setStrengthPrograms(sp); setCircuitPrograms(cp);
      setError("");
    } catch (e) {
      setError(e.message || "Errore nel caricamento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = async (summary) => {
    try {
      setEditing(await api.getPlan(summary.id));
    } catch (e) {
      setError(e.message || "Errore nel caricamento piano.");
    }
  };

  const save = async (plan) => {
    try {
      await api.savePlan(plan);
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message || "Salvataggio piano non riuscito.");
    }
  };

  const remove = async (id) => {
    try {
      await api.deletePlan(id);
      setPlans((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e.message || "Eliminazione non riuscita.");
    }
  };

  return (
    <div>
      <div style={S.sectionRow}>
        <div>
          <h2 style={S.h2}>Piani</h2>
          <p style={S.muted}>Un piano combina riscaldamenti in rotazione + un programma Forza + un programma Circuito</p>
        </div>
        <button style={S.primaryBtn} onClick={() => setEditing({ name: "Nuovo piano", warmupBlockIds: [], strengthProgramId: "", circuitProgramId: "", restBetweenBlocks: 120 })}>
          <Plus size={16} /> Nuovo piano
        </button>
      </div>

      {error && <p style={S.authError}>{error}</p>}
      {loading && <p style={S.muted}>Caricamento…</p>}
      {!loading && plans.length === 0 && <p style={S.muted}>Nessun piano creato.</p>}

      <div style={S.cardGrid}>
        {plans.map((p) => (
          <div key={p.id} style={S.card}>
            <div style={{ flex: 1 }}><div style={S.cardTitle}>{p.name}</div></div>
            <div style={S.cardActions}>
              <button style={S.iconBtn} title="Modifica" onClick={() => openEdit(p)}><Edit3 size={15} /></button>
              <button style={S.iconBtn} title="Elimina" onClick={() => remove(p.id)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <PlanEditor
          plan={editing}
          warmups={warmups}
          strengthPrograms={strengthPrograms}
          circuitPrograms={circuitPrograms}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PlanEditor({ plan, warmups, strengthPrograms, circuitPrograms, onSave, onCancel }) {
  const [name, setName] = useState(plan.name);
  const [warmupBlockIds, setWarmupBlockIds] = useState(plan.warmupBlockIds || []);
  const [strengthProgramId, setStrengthProgramId] = useState(plan.strengthProgramId || "");
  const [circuitProgramId, setCircuitProgramId] = useState(plan.circuitProgramId || "");
  const [restBetweenBlocks, setRestBetweenBlocks] = useState(plan.restBetweenBlocks ?? 120);
  const [testIndex, setTestIndex] = useState(0);
  const [testWorkout, setTestWorkout] = useState(null);
  const [testError, setTestError] = useState("");

  const strengthProgram = strengthPrograms.find((p) => p.id === strengthProgramId);
  const circuitProgram = circuitPrograms.find((p) => p.id === circuitProgramId);
  const totalSessions = Math.min(strengthProgram?.sessions.length || 0, circuitProgram?.sessions.length || 0);
  const lengthMismatch = strengthProgram && circuitProgram && strengthProgram.sessions.length !== circuitProgram.sessions.length;

  const warmupById = (id) => warmups.find((w) => w.id === id);
  const addWarmup = (id) => setWarmupBlockIds((prev) => [...prev, id]);
  const removeWarmupAt = (i) => setWarmupBlockIds((prev) => prev.filter((_, idx) => idx !== i));
  const moveWarmup = (i, dir) => setWarmupBlockIds((prev) => {
    const next = [...prev];
    const j = i + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const testSession = () => {
    setTestError("");
    if (!strengthProgram || !circuitProgram) { setTestError("Scegli prima un programma Forza e un programma Circuito."); return; }
    const orderedWarmups = warmupBlockIds.map(warmupById).filter(Boolean);
    const warmup = orderedWarmups.length ? orderedWarmups[testIndex % orderedWarmups.length] : null;
    const blocks = [];
    if (warmup) blocks.push({ id: "w", type: "standard", exercises: warmup.exercises, rounds: warmup.rounds });
    blocks.push({ id: "f", type: "strength", ...strengthProgram.sessions[testIndex] });
    api.circuitSessionToBlocks(circuitProgram.sessions[testIndex]).forEach((b, bj) => blocks.push({ id: `c${bj}`, type: "standard", ...b }));
    setTestWorkout({ id: "test", name: `Prova sessione ${testIndex + 1}`, restBetweenBlocks, blocks });
  };

  if (testWorkout) return <TestPlayer workout={testWorkout} onExit={() => setTestWorkout(null)} />;

  return (
    <div style={S.modalWrap} onClick={onCancel}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Piano</span>
          <button style={S.iconBtnSm} onClick={onCancel}><X size={15} /></button>
        </div>

        <label style={S.fieldLbl}>Nome</label>
        <input style={S.fieldInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Piano Marco — 4 mesi" />

        <label style={S.fieldLbl}>Programma Forza</label>
        <select style={S.fieldSelect} value={strengthProgramId} onChange={(e) => setStrengthProgramId(e.target.value)}>
          <option value="">— scegli —</option>
          {strengthPrograms.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sessions.length} sessioni)</option>)}
        </select>

        <label style={S.fieldLbl}>Programma Circuito</label>
        <select style={S.fieldSelect} value={circuitProgramId} onChange={(e) => setCircuitProgramId(e.target.value)}>
          <option value="">— scegli —</option>
          {circuitPrograms.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sessions.length} sessioni)</option>)}
        </select>

        <label style={S.fieldLbl}>Riposo tra blocchi (s)</label>
        <input type="number" style={S.fieldInput} value={restBetweenBlocks} onChange={(e) => setRestBetweenBlocks(Math.max(0, +e.target.value || 0))} />

        <div style={{ ...S.blockLabel, marginTop: 16, display: "block" }}>RISCALDAMENTI IN ROTAZIONE</div>
        {warmupBlockIds.length === 0 && <p style={S.muted}>Nessuno selezionato — l'atleta non avrà riscaldamento.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 0 12px" }}>
          {warmupBlockIds.map((id, i) => (
            <div key={i} style={S.exRow}>
              <div style={S.exFields}><div style={S.exNameStatic}>{i + 1}. {warmupById(id)?.name || "(eliminato)"}</div></div>
              <button style={S.iconBtnSm} onClick={() => moveWarmup(i, -1)} disabled={i === 0}><ChevronUp size={14} /></button>
              <button style={S.iconBtnSm} onClick={() => moveWarmup(i, 1)} disabled={i === warmupBlockIds.length - 1}><ChevronDown size={14} /></button>
              <button style={S.iconBtn} onClick={() => removeWarmupAt(i)}><X size={15} /></button>
            </div>
          ))}
        </div>
        <div style={S.pickerList}>
          {warmups.filter((w) => !warmupBlockIds.includes(w.id)).map((w) => (
            <button key={w.id} style={S.pickerItem} onClick={() => addWarmup(w.id)}>
              <div style={{ flex: 1, textAlign: "left", fontSize: 14, fontWeight: 600 }}>{w.name}</div>
              <Plus size={16} color="#C1FF72" />
            </button>
          ))}
          {warmups.length === 0 && <p style={{ ...S.muted, textAlign: "center", padding: 20 }}>Nessun riscaldamento creato. Crealo prima nella tab Riscaldamenti.</p>}
        </div>

        <div style={{ marginTop: 16, padding: 12, background: "#0f0f0f", border: "1px solid #222", borderRadius: 10 }}>
          <div style={{ fontSize: 13, color: "#ccc" }}>
            {!strengthProgram || !circuitProgram ? (
              "Scegli sia un Programma Forza sia un Programma Circuito per vedere il totale sessioni."
            ) : totalSessions > 0 ? (
              `${totalSessions} sessioni totali`
            ) : (
              <span style={{ color: "#f0b155" }}>
                {strengthProgram.sessions.length === 0 && "Il Programma Forza scelto non ha ancora sessioni. "}
                {circuitProgram.sessions.length === 0 && "Il Programma Circuito scelto non ha ancora sessioni. "}
                Aggiungine almeno una nella tab del programma (pulsante "Aggiungi sessione").
              </span>
            )}
          </div>
          {lengthMismatch && (
            <div style={{ fontSize: 12.5, color: "#f0b155", marginTop: 6 }}>
              Attenzione: i due programmi hanno un numero di sessioni diverso ({strengthProgram.sessions.length} vs {circuitProgram.sessions.length}) — il piano userà solo le prime {totalSessions}.
            </div>
          )}
          {totalSessions > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <input type="number" min={0} max={totalSessions - 1} style={{ ...S.numInputSm, marginTop: 0 }} value={testIndex}
                onChange={(e) => setTestIndex(Math.max(0, Math.min(totalSessions - 1, +e.target.value || 0)))} />
              <button style={S.ghostBtn} onClick={testSession}><Play size={14} /> Prova questa sessione</button>
            </div>
          )}
          {testError && <p style={{ ...S.authError, marginTop: 8 }}>{testError}</p>}
        </div>

        <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 16 }}
          onClick={() => name.trim() && onSave({
            id: plan.id, name: name.trim(), warmupBlockIds,
            strengthProgramId: strengthProgramId || null, circuitProgramId: circuitProgramId || null, restBetweenBlocks,
          })}>
          <Check size={16} /> Salva piano
        </button>
      </div>
    </div>
  );
}

// QA per l'admin: assembla una sessione al volo dalla composizione corrente
// del piano (senza doverlo prima salvare/assegnare) e la fa vedere/eseguire.
function TestPlayer({ workout, onExit }) {
  const [playing, setPlaying] = useState(false);
  if (playing) return <Player workout={workout} onExit={() => setPlaying(false)} />;
  return (
    <div style={S.modalWrap} onClick={onExit}>
      <div style={{ ...S.modal, maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Prova sessione</span>
          <button style={S.iconBtnSm} onClick={onExit}><X size={15} /></button>
        </div>
        <Preview workout={workout} onStart={() => setPlaying(true)} />
      </div>
    </div>
  );
}
