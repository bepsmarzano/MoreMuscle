import { useState, useEffect } from "react";
import { Play, Plus, Trash2, Edit3, ChevronLeft, Clock, Dumbbell, X, ListChecks, Library, Search, Check, Upload, Users, LogOut } from "lucide-react";
import { S, globalCss, ExGif, uid } from "../shared/ui.jsx";
import { Preview, Player } from "../player/WorkoutPlayer.jsx";
import { useAuth } from "../auth/AuthProvider.jsx";
import AdminAthletes from "./AdminAthletes.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Pannello admin: costruzione libreria esercizi + allenamenti (praticamente
// identico all'app originale, ma i dati vengono da Supabase invece che da
// localStorage) + tab "Atleti" per invitare e assegnare gli allenamenti.
// ---------------------------------------------------------------------------

// un esercizio dentro un allenamento referenzia la libreria via libId,
// ma tiene una copia di name/gif (snapshot) + reps/time specifici
const fromLib = (l) => ({ id: uid(), libId: l.id, name: l.name, gif: l.gif, reps: l.defReps, time: l.defTime });

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
      const created = { id: uid(), name: it.name, gif: it.gif, defReps: it.reps ?? 12, defTime: it.time ?? 40 };
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
  const [section, setSection] = useState("workouts"); // workouts | athletes
  const [library, setLibrary] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("home"); // home | library | edit | preview | play
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [lib, wks] = await Promise.all([api.getLibrary(), api.listWorkouts()]);
        if (!alive) return;
        setLibrary(lib);
        setWorkouts(wks);
      } catch (e) {
        if (alive) setError(e.message || "Errore nel caricamento dati.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const active = workouts.find((w) => w.id === activeId) || null;

  const persistLibrary = async (next) => {
    setLibrary(next); // aggiornamento ottimistico, coerente con l'UX di prima
    try { await api.saveLibrary(next); } catch (e) { setError(e.message || "Salvataggio libreria non riuscito."); }
  };

  const upsertWorkout = async (w) => {
    setWorkouts((prev) => {
      const i = prev.findIndex((x) => x.id === w.id);
      if (i === -1) return [...prev, w];
      const copy = [...prev]; copy[i] = w; return copy;
    });
    try {
      const saved = await api.saveWorkout(w);
      setWorkouts((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    } catch (e) { setError(e.message || "Salvataggio allenamento non riuscito."); }
  };

  const removeWorkout = async (id) => {
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
    try { await api.deleteWorkout(id); } catch (e) { setError(e.message || "Eliminazione non riuscita."); }
  };

  if (loading) {
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        <div style={S.authWrap}><p style={S.muted}>Caricamento…</p></div>
      </div>
    );
  }

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
          {section === "workouts" && view !== "home" && (
            <button style={S.ghostBtn} onClick={() => setView("home")}><ChevronLeft size={16} /> Home</button>
          )}
          {section === "workouts" && view === "home" && (
            <button style={S.ghostBtn} onClick={() => setView("library")}><Library size={15} /> Libreria</button>
          )}
          <button style={{ ...S.navTab, ...(section === "workouts" ? S.navTabActive : {}) }} onClick={() => { setSection("workouts"); setView("home"); }}>
            <ListChecks size={14} /> Allenamenti
          </button>
          <button style={{ ...S.navTab, ...(section === "athletes" ? S.navTabActive : {}) }} onClick={() => setSection("athletes")}>
            <Users size={14} /> Atleti
          </button>
          <button style={S.ghostBtn} onClick={signOut}><LogOut size={15} /> Esci</button>
        </div>
      </header>

      <main style={S.main}>
        {error && <p style={S.authError}>{error}</p>}
        {section === "athletes" ? (
          <AdminAthletes workouts={workouts} />
        ) : (
          <>
            {view === "home" && (
              <Home workouts={workouts}
                onNew={() => {
                  const w = { id: api.newWorkoutId(), name: "Nuovo allenamento", restBetweenBlocks: 120, blocks: [{ id: uid(), exercises: [], rounds: 1 }, { id: uid(), exercises: [], rounds: 1 }] };
                  upsertWorkout(w); setActiveId(w.id); setView("edit");
                }}
                onEdit={(id) => { setActiveId(id); setView("edit"); }}
                onStart={(id) => { setActiveId(id); setView("preview"); }}
                onDelete={removeWorkout} />
            )}
            {view === "library" && <LibraryView library={library} setLibrary={persistLibrary} />}
            {view === "edit" && active && <Editor workout={active} onChange={upsertWorkout} onDone={() => setView("home")} library={library} />}
            {view === "preview" && active && <Preview workout={active} onStart={() => setView("play")} onBack={() => setView("home")} />}
            {view === "play" && active && <Player workout={active} onExit={() => setView("preview")} />}
          </>
        )}
      </main>
    </div>
  );
}

// ---- HOME ------------------------------------------------------------------
function Home({ workouts, onNew, onEdit, onStart, onDelete }) {
  return (
    <div>
      <div style={S.sectionRow}>
        <h2 style={S.h2}>I tuoi allenamenti</h2>
        <button style={S.primaryBtn} onClick={onNew}><Plus size={16} /> Crea</button>
      </div>
      {workouts.length === 0 && <p style={S.muted}>Nessun allenamento. Creane uno.</p>}
      <div style={S.cardGrid}>
        {workouts.map((w) => {
          const exCount = w.blocks.reduce((a, b) => a + b.exercises.length * Math.max(1, b.rounds || 1), 0);
          const totalTime = w.blocks.reduce((a, b) => a + b.exercises.reduce((s, e) => s + e.time, 0) * Math.max(1, b.rounds || 1), 0) + (w.blocks.length - 1) * w.restBetweenBlocks;
          return (
            <div key={w.id} style={S.card}>
              <div style={{ flex: 1 }}>
                <div style={S.cardTitle}>{w.name}</div>
                <div style={S.cardMeta}>
                  <span><ListChecks size={13} /> {w.blocks.length} blocchi · {exCount} esercizi</span>
                  <span><Clock size={13} /> ~{Math.round(totalTime / 60)} min</span>
                </div>
              </div>
              <div style={S.cardActions}>
                <button style={S.primaryBtn} onClick={() => onStart(w.id)}><Play size={15} /> Avvia</button>
                <button style={S.iconBtn} title="Modifica" onClick={() => onEdit(w.id)}><Edit3 size={15} /></button>
                <button style={S.iconBtn} title="Elimina" onClick={() => onDelete(w.id)}><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
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
          <p style={S.muted}>Crea gli esercizi una volta, poi riusali negli allenamenti</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghostBtn} onClick={() => setImporting(true)}><Upload size={15} /> Importa</button>
          <button style={S.primaryBtn} onClick={() => setEditing({ id: uid(), name: "", gif: "", defReps: 10, defTime: 40, _new: true })}>
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
        <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 16 }}
          onClick={() => f.name.trim() && onSave({ ...f, _new: undefined })}>
          <Check size={16} /> Salva
        </button>
      </div>
    </div>
  );
}

// ---- EDITOR ALLENAMENTO ----------------------------------------------------
function Editor({ workout, onChange, onDone, library }) {
  const [picker, setPicker] = useState(null); // blockIndex per cui aprire il picker
  const set = (patch) => onChange({ ...workout, ...patch });
  const setBlockPatch = (bi, patch) => set({ blocks: workout.blocks.map((b, i) => (i === bi ? { ...b, ...patch } : b)) });
  const setBlock = (bi, exercises) => setBlockPatch(bi, { exercises });

  const addFromLib = (bi, libEx) => setBlock(bi, [...workout.blocks[bi].exercises, fromLib(libEx)]);
  const updateExercise = (bi, ei, patch) => setBlock(bi, workout.blocks[bi].exercises.map((e, i) => (i === ei ? { ...e, ...patch } : e)));
  const removeExercise = (bi, ei) => setBlock(bi, workout.blocks[bi].exercises.filter((_, i) => i !== ei));
  const addBlock = () => set({ blocks: [...workout.blocks, { id: uid(), exercises: [], rounds: 1 }] });
  const removeBlock = (bi) => set({ blocks: workout.blocks.filter((_, i) => i !== bi) });

  return (
    <div>
      <div style={S.sectionRow}>
        <input style={S.titleInput} value={workout.name} onChange={(e) => set({ name: e.target.value })} />
        <button style={S.primaryBtn} onClick={onDone}>Salva</button>
      </div>

      <div style={S.restRow}>
        <Clock size={15} />
        <span>Riposo tra i blocchi</span>
        <input type="number" style={S.numInput} value={workout.restBetweenBlocks}
          onChange={(e) => set({ restBetweenBlocks: Math.max(0, +e.target.value || 0) })} />
        <span style={S.muted}>secondi</span>
      </div>

      {workout.blocks.map((block, bi) => (
        <div key={block.id} style={S.blockCard}>
          <div style={S.blockHead}>
            <span style={S.blockLabel}>BLOCCO {bi + 1}</span>
            <label style={S.miniLbl}>round
              <input type="number" min={1} style={S.numInputSm} value={block.rounds || 1}
                onChange={(e) => setBlockPatch(bi, { rounds: Math.max(1, +e.target.value || 1) })} />
            </label>
            <span style={S.muted}>{block.exercises.length} esercizi</span>
            {workout.blocks.length > 1 && <button style={S.iconBtn} onClick={() => removeBlock(bi)}><Trash2 size={14} /></button>}
          </div>

          {block.exercises.map((ex, ei) => (
            <div key={ex.id} style={S.exRow}>
              <ExGif src={ex.gif} alt="" style={S.exThumb} />
              <div style={S.exFields}>
                <div style={S.exNameStatic}>{ex.name}</div>
                <div style={S.exNums}>
                  <label style={S.miniLbl}>rep
                    <input type="number" style={S.numInputSm} value={ex.reps} onChange={(e) => updateExercise(bi, ei, { reps: +e.target.value || 0 })} />
                  </label>
                  <label style={S.miniLbl}>tempo (s)
                    <input type="number" style={S.numInputSm} value={ex.time} onChange={(e) => updateExercise(bi, ei, { time: Math.max(1, +e.target.value || 1) })} />
                  </label>
                </div>
              </div>
              <button style={S.iconBtn} onClick={() => removeExercise(bi, ei)}><X size={15} /></button>
            </div>
          ))}

          <button style={S.dashedBtn} onClick={() => setPicker(bi)}><Library size={14} /> Aggiungi dalla libreria</button>
        </div>
      ))}

      <button style={S.dashedBtn} onClick={addBlock}><Plus size={14} /> Aggiungi blocco</button>

      {picker !== null && (
        <LibraryPicker library={library} onPick={(libEx) => addFromLib(picker, libEx)} onClose={() => setPicker(null)} />
      )}
    </div>
  );
}

function LibraryPicker({ library, onPick, onClose }) {
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
