import { useState, useEffect } from "react";
import { UserPlus, RefreshCw, X, Check, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { S } from "../shared/ui.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Pannello "Atleti": lista atleti invitati con riepilogo questionario,
// assegnazione del piano (tra quelli creati nella tab Piani), massimali e
// storico dei log (rep AMRAP / carichi usati) per decidere le sessioni
// future, e invito di nuovi atleti via email.
// ---------------------------------------------------------------------------
export default function AdminAthletes() {
  const [athletes, setAthletes] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([api.listAthletes(), api.listPlans()]);
      setAthletes(a);
      setPlans(p);
      setError("");
    } catch (e) {
      setError(e.message || "Errore nel caricamento atleti.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAssign = async (athleteId, planId) => {
    setBusyId(athleteId);
    try {
      await api.assignPlan(athleteId, planId || null);
      setAthletes((prev) => prev.map((a) => (a.id === athleteId ? { ...a, assigned_plan_id: planId || null, current_session_position: 0 } : a)));
    } catch (e) {
      setError(e.message || "Assegnazione non riuscita.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div style={S.sectionRow}>
        <div>
          <h2 style={S.h2}>Atleti</h2>
          <p style={S.muted}>Invita nuovi atleti e assegna loro un piano in base al questionario</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.ghostBtn} onClick={load}><RefreshCw size={14} /> Aggiorna</button>
          <button style={S.primaryBtn} onClick={() => setInviting(true)}><UserPlus size={16} /> Invita atleta</button>
        </div>
      </div>

      {error && <p style={S.authError}>{error}</p>}
      {loading && <p style={S.muted}>Caricamento…</p>}
      {!loading && athletes.length === 0 && <p style={S.muted}>Nessun atleta invitato ancora.</p>}

      <div style={S.athleteList}>
        {athletes.map((a) => {
          const q = a.questionnaire;
          const expanded = expandedId === a.id;
          return (
            <div key={a.id} style={S.athleteCard}>
              <div style={S.athleteHead}>
                <div>
                  <div style={S.athleteName}>{a.full_name || "Senza nome"}</div>
                  <div style={S.athleteEmail}>{a.email}</div>
                </div>
                <span style={{ ...S.badge, ...(a.assigned_plan_id ? S.badgeAssigned : S.badgeWaiting) }}>
                  {a.assigned_plan_id ? `Sessione ${(a.current_session_position || 0) + 1}` : "In attesa"}
                </span>
              </div>

              {q ? (
                <div style={S.qGrid}>
                  <div><div style={S.qLabel}>Obiettivo</div><div style={S.qValue}>{q.goal || "—"}</div></div>
                  <div><div style={S.qLabel}>Livello</div><div style={S.qValue}>{q.level || "—"}</div></div>
                  <div><div style={S.qLabel}>Infortuni</div><div style={S.qValue}>{q.injuries || "—"}</div></div>
                  <div><div style={S.qLabel}>Giorni/sett.</div><div style={S.qValue}>{q.days_per_week ?? "—"}</div></div>
                  <div><div style={S.qLabel}>Attrezzatura</div><div style={S.qValue}>{q.equipment || "—"}</div></div>
                </div>
              ) : (
                <p style={S.muted}>Questionario non ancora compilato.</p>
              )}
              {q?.notes && <p style={{ ...S.muted, marginBottom: 12 }}>Note: {q.notes}</p>}

              <div style={S.assignRow}>
                <span style={S.miniLbl}>Piano assegnato</span>
                <select
                  style={{ ...S.fieldSelect, width: "auto", minWidth: 200 }}
                  value={a.assigned_plan_id || ""}
                  disabled={busyId === a.id}
                  onChange={(e) => handleAssign(a.id, e.target.value)}
                >
                  <option value="">— nessuno —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button style={S.ghostBtn} onClick={() => setExpandedId(expanded ? null : a.id)}>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Massimali &amp; storico
                </button>
              </div>

              {expanded && <AthleteDetail athleteId={a.id} />}
            </div>
          );
        })}
      </div>

      {inviting && <InviteModal onClose={() => setInviting(false)} onInvited={load} />}
    </div>
  );
}

// massimali (per calcolare le percentuali della Forza) + ultimi log annotati
// dall'atleta (rep AMRAP, livelli di carico) — utile per decidere le
// percentuali/carichi della prossima sessione da costruire.
function AthleteDetail({ athleteId }) {
  const [maxes, setMaxes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newMax, setNewMax] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [m, l] = await Promise.all([api.getAthleteMaxes(athleteId), api.getExerciseLogs(athleteId, 10)]);
      setMaxes(m);
      setLogs(l);
      setError("");
    } catch (e) {
      setError(e.message || "Errore nel caricamento dettagli.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [athleteId]);

  const saveExistingMax = async (liftKey, kg) => {
    if (!kg) return;
    try { await api.setAthleteMax(athleteId, liftKey, +kg); load(); }
    catch (e) { setError(e.message || "Salvataggio massimale non riuscito."); }
  };

  const addMax = async () => {
    if (!newKey.trim() || !newMax) return;
    try {
      await api.setAthleteMax(athleteId, newKey.trim(), +newMax);
      setNewKey(""); setNewMax("");
      load();
    } catch (e) {
      setError(e.message || "Salvataggio massimale non riuscito.");
    }
  };

  return (
    <div style={{ background: "#0f0f0f", border: "1px solid #222", borderRadius: 10, padding: 14, marginTop: 10 }}>
      {error && <p style={S.authError}>{error}</p>}
      {loading ? (
        <p style={S.muted}>Caricamento…</p>
      ) : (
        <>
          <div style={S.blockLabel}>MASSIMALI</div>
          {maxes.length === 0 && <p style={S.muted}>Nessun massimale impostato.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0 12px" }}>
            {maxes.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                <span style={S.qValue}>{m.lift_key}</span>
                <input type="number" defaultValue={m.max_kg} style={{ ...S.numInputSm, marginTop: 0 }}
                  onBlur={(e) => saveExistingMax(m.lift_key, e.target.value)} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={S.fieldInput} placeholder="chiave (es. back_squat)" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
            <input type="number" style={{ ...S.fieldInput, maxWidth: 90 }} placeholder="kg" value={newMax} onChange={(e) => setNewMax(e.target.value)} />
            <button style={S.iconBtn} onClick={addMax}><Plus size={15} /></button>
          </div>

          <div style={{ ...S.blockLabel, marginTop: 16 }}>ULTIMI LOG</div>
          {logs.length === 0 && <p style={S.muted}>Nessuna annotazione ancora.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {logs.map((l) => (
              <div key={l.id} style={{ fontSize: 12.5, color: "#ccc" }}>
                {new Date(l.logged_at).toLocaleDateString("it-IT")} · {l.exercise_name} — {l.reps != null ? `${l.reps} rep` : l.load_label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InviteModal({ onClose, onInvited }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!email.trim()) { setError("Inserisci un'email."); return; }
    setBusy(true); setError("");
    try {
      await api.inviteAthlete({ email: email.trim(), fullName: fullName.trim() || null });
      setDone(true);
      onInvited();
    } catch (e) {
      setError(e.message || "Invito non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.modalWrap} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <span style={S.modalTitle}>Invita atleta</span>
          <button style={S.iconBtnSm} onClick={onClose}><X size={15} /></button>
        </div>

        {done ? (
          <p style={S.authNote}>Invito inviato a {email}. Riceverà un'email per impostare la password.</p>
        ) : (
          <>
            <label style={S.fieldLbl}>Nome (opzionale)</label>
            <input style={S.fieldInput} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Es. Mario Rossi" />
            <label style={S.fieldLbl}>Email</label>
            <input style={S.fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="mario@esempio.com" />
            {error && <p style={S.authError}>{error}</p>}
            <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 16 }} onClick={submit} disabled={busy}>
              <Check size={16} /> {busy ? "Invio…" : "Invia invito"}
            </button>
            <p style={{ ...S.muted, marginTop: 10 }}>
              Nota: l'invio funziona solo dopo il deploy (o con <code>vercel dev</code> in locale), perché richiede la funzione serverless <code>/api/invite-athlete</code>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
