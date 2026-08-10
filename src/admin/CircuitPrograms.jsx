import { useState, useEffect } from "react";
import { Plus, Trash2, Edit3, X, Check, Copy, ChevronUp, ChevronDown } from "lucide-react";
import { S } from "../shared/ui.jsx";
import { StandardBlockEditor } from "./blockEditors.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Programmi Circuito: sequenza ORDINATA di sessioni Circuito (progressione),
// riusabile su più piani/atleti. Ogni sessione = un blocco standard di oggi
// (N esercizi con GIF, ripetuti per round).
// ---------------------------------------------------------------------------
export default function CircuitPrograms({ library }) {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { id?, name, sessions } | null

  const load = async () => {
    setLoading(true);
    try {
      setPrograms(await api.listCircuitPrograms());
      setError("");
    } catch (e) {
      setError(e.message || "Errore nel caricamento programmi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (program) => {
    try {
      await api.saveCircuitProgram(program);
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message || "Salvataggio non riuscito.");
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteCircuitProgram(id);
      setPrograms((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e.message || "Eliminazione non riuscita.");
    }
  };

  return (
    <div>
      <div style={S.sectionRow}>
        <div>
          <h2 style={S.h2}>Programmi Circuito</h2>
          <p style={S.muted}>Sequenze di sessioni Circuito (progressione) riusabili su più piani/atleti</p>
        </div>
        <button style={S.primaryBtn} onClick={() => setEditing({ name: "Nuovo programma", sessions: [] })}>
          <Plus size={16} /> Nuovo
        </button>
      </div>

      {error && <p style={S.authError}>{error}</p>}
      {loading && <p style={S.muted}>Caricamento…</p>}
      {!loading && programs.length === 0 && <p style={S.muted}>Nessun programma creato.</p>}

      <div style={S.cardGrid}>
        {programs.map((p) => (
          <div key={p.id} style={S.card}>
            <div style={{ flex: 1 }}>
              <div style={S.cardTitle}>{p.name}</div>
              <div style={S.cardMeta}><span>{p.sessions.length} sessioni</span></div>
            </div>
            <div style={S.cardActions}>
              <button style={S.iconBtn} title="Modifica" onClick={() => setEditing(p)}><Edit3 size={15} /></button>
              <button style={S.iconBtn} title="Elimina" onClick={() => remove(p.id)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && <ProgramEditor program={editing} library={library} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

// tollera anche la vecchia forma "un blocco solo" (sessioni create prima
// dell'introduzione dei 2 blocchi per sessione)
const sessionBlocks = (s) => s.blocks || [{ exercises: s.exercises || [], rounds: s.rounds || 1 }, { exercises: [], rounds: 1 }];

function ProgramEditor({ program, library, onSave, onCancel }) {
  const [name, setName] = useState(program.name);
  const [sessions, setSessions] = useState(program.sessions);
  const [openIndex, setOpenIndex] = useState(sessions.length ? 0 : null);

  const addSession = () => {
    setSessions((prev) => [...prev, { blocks: [{ exercises: [], rounds: 1 }, { exercises: [], rounds: 1 }] }]);
    setOpenIndex(sessions.length);
  };
  const duplicateSession = (i) => {
    setSessions((prev) => {
      const copy = [...prev];
      copy.splice(i + 1, 0, JSON.parse(JSON.stringify(prev[i])));
      return copy;
    });
    setOpenIndex(i + 1);
  };
  const removeSession = (i) => {
    setSessions((prev) => prev.filter((_, idx) => idx !== i));
    setOpenIndex(null);
  };
  const move = (i, dir) => {
    setSessions((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setOpenIndex((oi) => (oi === i ? i + dir : oi === i + dir ? i : oi));
  };
  const patchSessionBlock = (i, bj, patch) => setSessions((prev) => prev.map((s, idx) => {
    if (idx !== i) return s;
    const blocks = sessionBlocks(s).map((b, k) => (k === bj ? { ...b, ...patch } : b));
    return { blocks };
  }));

  return (
    <div style={S.modalWrap} onClick={onCancel}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Programma Circuito</span>
          <button style={S.iconBtnSm} onClick={onCancel}><X size={15} /></button>
        </div>
        <label style={S.fieldLbl}>Nome</label>
        <input style={S.fieldInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Circuito full body — 8 settimane" />

        <div style={{ ...S.blockLabel, marginTop: 16, marginBottom: 8, display: "block" }}>SESSIONI ({sessions.length})</div>
        {sessions.map((s, i) => {
          const blocks = sessionBlocks(s);
          const totalEx = blocks.reduce((a, b) => a + (b.exercises || []).length, 0);
          return (
            <div key={i} style={S.blockCard}>
              <div style={S.blockHead}>
                <span style={S.blockLabel}>SESSIONE {i + 1}</span>
                <span style={S.muted}>{totalEx} esercizi su {blocks.length} blocchi</span>
                <button style={S.iconBtnSm} onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp size={14} /></button>
                <button style={S.iconBtnSm} onClick={() => move(i, 1)} disabled={i === sessions.length - 1}><ChevronDown size={14} /></button>
                <button style={S.iconBtnSm} title="Duplica" onClick={() => duplicateSession(i)}><Copy size={14} /></button>
                <button style={S.iconBtn} onClick={() => removeSession(i)}><Trash2 size={14} /></button>
                <button style={S.ghostBtn} onClick={() => setOpenIndex(openIndex === i ? null : i)}>{openIndex === i ? "Chiudi" : "Modifica"}</button>
              </div>
              {openIndex === i && blocks.map((b, bj) => (
                <div key={bj} style={{ marginTop: bj > 0 ? 16 : 0, paddingTop: bj > 0 ? 14 : 0, borderTop: bj > 0 ? "1px solid #232323" : "none" }}>
                  <div style={{ ...S.blockLabel, marginBottom: 8 }}>BLOCCO {bj + 1}{bj > 0 ? " · riposo a cronometro dal blocco precedente" : ""}</div>
                  <StandardBlockEditor block={b} onPatch={(patch) => patchSessionBlock(i, bj, patch)} library={library} />
                </div>
              ))}
            </div>
          );
        })}
        <button style={S.dashedBtn} onClick={addSession}><Plus size={14} /> Aggiungi sessione</button>

        <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 16 }}
          onClick={() => name.trim() && onSave({ id: program.id, name: name.trim(), sessions })}>
          <Check size={16} /> Salva programma
        </button>
      </div>
    </div>
  );
}
