import { useState, useEffect } from "react";
import { Plus, Trash2, Edit3, X, Check } from "lucide-react";
import { S } from "../shared/ui.jsx";
import { StandardBlockEditor } from "./blockEditors.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Riscaldamenti: routine a corpo libero riusabili. Un piano ne mette alcuni
// in rotazione (ordine scelto lì) tra le sessioni — creali una volta, qui.
// ---------------------------------------------------------------------------
export default function WarmupLibrary({ library }) {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // { id?, name, exercises, rounds } | null

  const load = async () => {
    setLoading(true);
    try {
      setBlocks(await api.listWarmupBlocks());
      setError("");
    } catch (e) {
      setError(e.message || "Errore nel caricamento riscaldamenti.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (block) => {
    try {
      await api.saveWarmupBlock(block);
      setEditing(null);
      load();
    } catch (e) {
      setError(e.message || "Salvataggio non riuscito.");
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteWarmupBlock(id);
      setBlocks((prev) => prev.filter((b) => b.id !== id));
    } catch (e) {
      setError(e.message || "Eliminazione non riuscita.");
    }
  };

  return (
    <div>
      <div style={S.sectionRow}>
        <div>
          <h2 style={S.h2}>Riscaldamenti</h2>
          <p style={S.muted}>Routine a corpo libero riusabili: un piano ne mette alcuni in rotazione tra le sessioni</p>
        </div>
        <button style={S.primaryBtn} onClick={() => setEditing({ name: "Nuovo riscaldamento", exercises: [], rounds: 1 })}>
          <Plus size={16} /> Nuovo
        </button>
      </div>

      {error && <p style={S.authError}>{error}</p>}
      {loading && <p style={S.muted}>Caricamento…</p>}
      {!loading && blocks.length === 0 && <p style={S.muted}>Nessun riscaldamento creato.</p>}

      <div style={S.cardGrid}>
        {blocks.map((b) => (
          <div key={b.id} style={S.card}>
            <div style={{ flex: 1 }}>
              <div style={S.cardTitle}>{b.name}</div>
              <div style={S.cardMeta}><span>{b.exercises.length} esercizi · {b.rounds} round</span></div>
            </div>
            <div style={S.cardActions}>
              <button style={S.iconBtn} title="Modifica" onClick={() => setEditing(b)}><Edit3 size={15} /></button>
              <button style={S.iconBtn} title="Elimina" onClick={() => remove(b.id)}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && <WarmupEditor block={editing} library={library} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function WarmupEditor({ block, library, onSave, onCancel }) {
  const [name, setName] = useState(block.name);
  const [content, setContent] = useState({ exercises: block.exercises, rounds: block.rounds });

  return (
    <div style={S.modalWrap} onClick={onCancel}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Riscaldamento</span>
          <button style={S.iconBtnSm} onClick={onCancel}><X size={15} /></button>
        </div>
        <label style={S.fieldLbl}>Nome</label>
        <input style={S.fieldInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Riscaldamento A" />

        <div style={{ marginTop: 14 }}>
          <StandardBlockEditor block={content} onPatch={(patch) => setContent((c) => ({ ...c, ...patch }))} library={library} />
        </div>

        <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 16 }}
          onClick={() => name.trim() && onSave({ id: block.id, name: name.trim(), ...content })}>
          <Check size={16} /> Salva
        </button>
      </div>
    </div>
  );
}
