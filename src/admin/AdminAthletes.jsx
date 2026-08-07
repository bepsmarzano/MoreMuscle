import { useState, useEffect } from "react";
import { UserPlus, RefreshCw, X, Check } from "lucide-react";
import { S } from "../shared/ui.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Pannello "Atleti": lista atleti invitati con riepilogo questionario,
// assegnazione dell'allenamento (tra quelli creati dall'admin) e invito
// di nuovi atleti via email.
// ---------------------------------------------------------------------------
export default function AdminAthletes({ workouts }) {
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setAthletes(await api.listAthletes());
      setError("");
    } catch (e) {
      setError(e.message || "Errore nel caricamento atleti.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAssign = async (athleteId, workoutId) => {
    setBusyId(athleteId);
    try {
      await api.assignWorkout(athleteId, workoutId || null);
      setAthletes((prev) => prev.map((a) => (a.id === athleteId ? { ...a, assigned_workout_id: workoutId || null } : a)));
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
          <p style={S.muted}>Invita nuovi atleti e assegna loro un allenamento in base al questionario</p>
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
          return (
            <div key={a.id} style={S.athleteCard}>
              <div style={S.athleteHead}>
                <div>
                  <div style={S.athleteName}>{a.full_name || "Senza nome"}</div>
                  <div style={S.athleteEmail}>{a.email}</div>
                </div>
                <span style={{ ...S.badge, ...(a.assigned_workout_id ? S.badgeAssigned : S.badgeWaiting) }}>
                  {a.assigned_workout_id ? "Allenamento assegnato" : "In attesa"}
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
                <span style={S.miniLbl}>Allenamento assegnato</span>
                <select
                  style={{ ...S.fieldSelect, width: "auto", minWidth: 200 }}
                  value={a.assigned_workout_id || ""}
                  disabled={busyId === a.id}
                  onChange={(e) => handleAssign(a.id, e.target.value)}
                >
                  <option value="">— nessuno —</option>
                  {workouts.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {inviting && <InviteModal onClose={() => setInviting(false)} onInvited={load} />}
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
