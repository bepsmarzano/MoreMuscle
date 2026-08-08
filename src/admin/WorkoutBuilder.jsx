import { useState, useEffect } from "react";
import { Plus, Trash2, Edit3, Dumbbell, X, Library, Search, Check, Upload, Users, LogOut, Flame, Repeat, CalendarRange } from "lucide-react";
import { S, globalCss, ExGif, uid } from "../shared/ui.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import AdminAthletes from "./AdminAthletes.jsx";
import PlanBuilder from "./PlanBuilder.jsx";
import WarmupLibrary from "./WarmupLibrary.jsx";
import StrengthPrograms from "./StrengthPrograms.jsx";
import CircuitPrograms from "./CircuitPrograms.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Guscio admin: header + navigazione tra le sezioni. Gestisce solo la
// Libreria esercizi qui dentro; Riscaldamenti/Forza/Circuiti/Piani/Atleti
// vivono nei rispettivi moduli, tutti condividono la `library` caricata qui.
// ---------------------------------------------------------------------------

export const EQUIPMENT_LABELS = { bodyweight: "Corpo libero", db1: "1 manubrio", db2: "2 manubri", kb: "Kettlebell" };

// ---- Import libreria da CSV (es. esportato da Google Sheet) ---------------
// formato righe: Nome,GIF[,Rep,Tempo] — l'header (se presente) viene ignorato
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  return rows;
}

function rowsToImportItems(rows) {
  let data = rows;
  if (data.length && /^(nome|name|esercizio|exercise)$/i.test((data[0][0] || "").trim())) data = data.slice(1);
  return data
    .map((r) => ({
      name: (r[0] || "").trim(),
      gif: (r[1] || "").trim(),
      reps: r[2] !== undefined && r[2].trim() !== "" ? Math.max(0, +r[2] || 0) : null,
      time: r[3] !== undefined && r[3].trim() !== "" ? Math.max(1, +r[3] || 40) : null,
    }))
    .filter((e) => e.name);
}

// aggiorna gli esercizi esistenti (per nome, case-insensitive) e aggiunge i nuovi
function mergeLibraryImport(library, items) {
  const next = [...library];
  const indexByName = new Map(next.map((e, i) => [e.name.toLowerCase(), i]));
  let added = 0, updated = 0;
  items.forEach((it) => {
    const key = it.name.toLowerCase();
    const i = indexByName.get(key);
    if (i !== undefined) {
      const cur = next[i];
      next[i] = { ...cur, gif: it.gif || cur.gif, defReps: it.reps ?? cur.defReps, defTime: it.time ?? cur.defTime };
      updated++;
    } else {
      const created = { id: uid(), name: it.name, gif: it.gif, defReps: it.reps ?? 12, defTime: it.time ?? 40, equipment: "bodyweight" };
      next.push(created);
      indexByName.set(key, next.length - 1);
      added++;
    }
  });
  return { next, added, updated };
}

// ===========================================================================
export default function WorkoutBuilder() {
  const { profile, signOut } = useAuth();
  const [section, setSection] = useState("library"); // library | warmups | strength | circuits | plans | athletes
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const lib = await api.getLibrary();
        if (alive) setLibrary(lib);
      } catch (e) {
        if (alive) setError(e.message || "Errore nel caricamento dati.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const persistLibrary = async (next) => {
    setLibrary(next); // aggiornamento ottimistico, coerente con l'UX di prima
    try { await api.saveLibrary(next); } catch (e) { setError(e.message || "Salvataggio libreria non riuscito."); }
  };

  if (loading) {
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        <div style={S.authWrap}><p style={S.muted}>Caricamento…</p></div>
      </div>
    );
  }

  const tabs = [
    { key: "library", label: "Libreria", icon: Library },
    { key: "warmups", label: "Riscaldamenti", icon: Flame },
    { key: "strength", label: "Forza", icon: Dumbbell },
    { key: "circuits", label: "Circuiti", icon: Repeat },
    { key: "plans", label: "Piani", icon: CalendarRange },
    { key: "athletes", label: "Atleti", icon: Users },
  ];

  return (
    <div style={S.app}>
      <style>{globalCss}</style>
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={S.logoMark}><Dumbbell size={18} /></div>
          <div>
            <div style={S.logoText}>MORE MUSCLE</div>
            <div style={S.logoSub}>{profile?.full_name || profile?.email}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button key={t.key} style={{ ...S.navTab, ...(section === t.key ? S.navTabActive : {}) }} onClick={() => setSection(t.key)}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
          <button style={S.ghostBtn} onClick={signOut}><LogOut size={15} /> Esci</button>
        </div>
      </header>

      <main style={S.main}>
        {error && <p style={S.authError}>{error}</p>}
        {section === "library" && <LibraryView library={library} setLibrary={persistLibrary} />}
        {section === "warmups" && <WarmupLibrary library={library} />}
        {section === "strength" && <StrengthPrograms library={library} />}
        {section === "circuits" && <CircuitPrograms library={library} />}
        {section === "plans" && <PlanBuilder />}
        {section === "athletes" && <AdminAthletes />}
      </main>
    </div>
  );
}

// ---- LIBRERIA --------------------------------------------------------------
function LibraryView({ library, setLibrary }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);

  const filtered = library.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));

  const save = (ex) => {
    const i = library.findIndex((x) => x.id === ex.id);
    const next = i === -1 ? [...library, ex] : library.map((x, idx) => (idx === i ? ex : x));
    setLibrary(next);
    setEditing(null);
  };
  const del = (id) => setLibrary(library.filter((e) => e.id !== id));

  return (
    <div>
      <div style={S.sectionRow}>
        <div>
          <h2 style={S.h2}>Libreria esercizi</h2>
          <p style={S.muted}>Crea gli esercizi una volta, poi riusali in riscaldamenti/forza/circuiti</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghostBtn} onClick={() => setImporting(true)}><Upload size={15} /> Importa</button>
          <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), name: "", gif: "", defReps: 10, defTime: 40, equipment: "bodyweight", _new: true })}>
            <Plus size={16} /> Nuovo
          </button>
        </div>
      </div>

      <div style={S.searchRow}>
        <Search size={16} color="#777" />
        <input style={S.searchInput} placeholder="Cerca esercizio…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div style={S.libGrid}>
        {filtered.map((ex) => (
          <div key={ex.id} style={S.libCard}>
            <ExGif src={ex.gif} alt={ex.name} style={S.libImg} />
            <div style={S.libInfo}>
              <div style={S.libName}>{ex.name || "Senza nome"}</div>
              <div style={S.libMeta}>{ex.defReps > 1 ? `${ex.defReps} rep` : "hold"} · {ex.defTime}s</div>
            </div>
            <div style={S.libActions}>
              <button style={S.iconBtnSm} onClick={() => setEditing(ex)}><Edit3 size={13} /></button>
              <button style={S.iconBtnSm} onClick={() => del(ex.id)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <p style={S.muted}>Nessun esercizio trovato.</p>}

      {editing && <ExerciseEditor ex={editing} onSave={save} onCancel={() => setEditing(null)} />}
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onImport={(items) => {
            const { next, added, updated } = mergeLibraryImport(library, items);
            setLibrary(next);
            return { added, updated };
          }}
        />
      )}
    </div>
  );
}

function ImportModal({ onImport, onClose }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const runImport = (csvText) => {
    const rows = parseCSV(csvText);
    const items = rowsToImportItems(rows);
    if (!items.length) { setError("Nessuna riga valida trovata nel CSV."); setResult(null); return; }
    const { added, updated } = onImport(items);
    setError("");
    setResult({ added, updated, total: items.length });
  };

  const loadBundled = async () => {
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/data/esercizi.csv");
      if (!res.ok) throw new Error("fetch failed");
      runImport(await res.text());
    } catch {
      setError("Impossibile caricare la libreria da /data/esercizi.csv.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => runImport(String(reader.result || ""));
    reader.readAsText(f);
  };

  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Importa libreria</span>
          <button style={S.iconBtnSm} onClick={onClose}><X size={15} /></button>
        </div>
        <p style={S.muted}>Gli esercizi già presenti (stesso nome) vengono aggiornati, gli altri aggiunti. Formato CSV: <code>Nome,GIF,Rep,Tempo</code> (le ultime due colonne sono opzionali).</p>

        <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", margin: "14px 0" }} onClick={loadBundled} disabled={busy}>
          <Upload size={16} /> {busy ? "Importazione…" : "Importa dal foglio Google (237 esercizi)"}
        </button>

        <label style={S.fieldLbl}>Oppure carica un file CSV</label>
        <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ color: "#ccc", fontSize: 13, marginBottom: 10 }} />

        <label style={S.fieldLbl}>…o incolla il CSV qui</label>
        <textarea
          style={{ ...S.fieldInput, height: 100, fontFamily: "monospace", fontSize: 12, resize: "vertical" }}
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"Nome,GIF\nPush-up,https://…"} />
        <button style={{ ...S.dashedBtn, marginTop: 8 }} onClick={() => text.trim() && runImport(text)}>
          <Check size={14} /> Importa testo incollato
        </button>

        {error && <p style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{error}</p>}
        {result && (
          <p style={{ color: "#4ade80", fontSize: 13, marginTop: 12 }}>
            Fatto — {result.added} nuovi, {result.updated} aggiornati (su {result.total} righe).
          </p>
        )}
      </div>
    </div>
  );
}

function ExerciseEditor({ ex, onSave, onCancel }) {
  const [f, setF] = useState(ex);
  const set = (p) => setF({ ...f, ...p });
  return (
    <div style={S.modalWrap} onClick={onCancel}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>{f._new ? "Nuovo esercizio" : "Modifica esercizio"}</span>
          <button style={S.iconBtnSm} onClick={onCancel}><X size={15} /></button>
        </div>
        <ExGif src={f.gif} alt="" style={S.modalPreview} />
        <label style={S.fieldLbl}>Nome</label>
        <input style={S.fieldInput} value={f.name} placeholder="Es. Push-up" onChange={(e) => set({ name: e.target.value })} />
        <label style={S.fieldLbl}>URL GIF</label>
        <input style={S.fieldInput} value={f.gif} placeholder="https://…" onChange={(e) => set({ gif: e.target.value })} />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLbl}>Rep di default</label>
            <input type="number" style={S.fieldInput} value={f.defReps} onChange={(e) => set({ defReps: +e.target.value || 0 })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.fieldLbl}>Tempo default (s)</label>
            <input type="number" style={S.fieldInput} value={f.defTime} onChange={(e) => set({ defTime: Math.max(1, +e.target.value || 1) })} />
          </div>
        </div>
        <label style={S.fieldLbl}>Attrezzatura</label>
        <select style={S.fieldSelect} value={f.equipment || "bodyweight"} onChange={(e) => set({ equipment: e.target.value })}>
          {Object.entries(EQUIPMENT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <p style={{ ...S.muted, marginTop: 4 }}>Se non è a corpo libero, nel Circuito verrà chiesto all'atleta il livello di carico usato.</p>
        <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 16 }}
          onClick={() => f.name.trim() && onSave({ ...f, _new: undefined })}>
          <Check size={16} /> Salva
        </button>
      </div>
    </div>
  );
}
