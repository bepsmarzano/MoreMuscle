import { useState } from "react";
import { Check } from "lucide-react";
import { S } from "../shared/ui.jsx";
import * as api from "../lib/api.js";

const GOALS = ["Perdere peso", "Aumentare massa muscolare", "Tonificare", "Migliorare resistenza", "Prevenzione/riabilitazione infortuni", "Altro"];
const LEVELS = ["Principiante", "Intermedio", "Avanzato"];

// ---------------------------------------------------------------------------
// Questionario standard compilato dall'atleta al primo accesso (self-service).
// L'admin lo consulta nel pannello "Atleti" per decidere quale allenamento
// assegnare. Modificabile anche dopo l'invio (basta tornare su questa vista).
// ---------------------------------------------------------------------------
export default function Questionnaire({ athleteId, initial, onSaved }) {
  const [f, setF] = useState({
    goal: initial?.goal || "",
    level: initial?.level || "",
    injuries: initial?.injuries || "",
    days_per_week: initial?.days_per_week ?? 3,
    equipment: initial?.equipment || "",
    notes: initial?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (p) => setF({ ...f, ...p });

  const submit = async () => {
    if (!f.goal || !f.level) { setError("Seleziona almeno obiettivo e livello."); return; }
    setBusy(true); setError("");
    try {
      await api.saveQuestionnaire(athleteId, f);
      onSaved();
    } catch (e) {
      setError(e.message || "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={S.authWrap}>
      <div style={{ ...S.authCard, maxWidth: 480 }}>
        <div style={S.authTitle}>Prima di iniziare</div>
        <p style={S.authSub}>Qualche domanda per capire come allenarti al meglio — la persona che ti segue userà queste risposte per assegnarti l'allenamento giusto.</p>

        <label style={S.fieldLbl}>Obiettivo principale</label>
        <select style={S.fieldSelect} value={f.goal} onChange={(e) => set({ goal: e.target.value })}>
          <option value="">Seleziona…</option>
          {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        <label style={S.fieldLbl}>Livello di allenamento</label>
        <select style={S.fieldSelect} value={f.level} onChange={(e) => set({ level: e.target.value })}>
          <option value="">Seleziona…</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        <label style={S.fieldLbl}>Infortuni o limitazioni</label>
        <textarea style={{ ...S.fieldInput, height: 70, resize: "vertical" }} value={f.injuries}
          placeholder="Es. nessuno, oppure specifica (schiena, ginocchio, ecc.)"
          onChange={(e) => set({ injuries: e.target.value })} />

        <label style={S.fieldLbl}>Giorni disponibili a settimana</label>
        <input type="number" min={1} max={7} style={S.fieldInput} value={f.days_per_week}
          onChange={(e) => set({ days_per_week: Math.min(7, Math.max(1, +e.target.value || 1)) })} />

        <label style={S.fieldLbl}>Attrezzatura a disposizione</label>
        <input style={S.fieldInput} value={f.equipment}
          placeholder="Es. manubri, kettlebell, elastici, corpo libero…"
          onChange={(e) => set({ equipment: e.target.value })} />

        <label style={S.fieldLbl}>Altre note (opzionale)</label>
        <textarea style={{ ...S.fieldInput, height: 60, resize: "vertical" }} value={f.notes}
          onChange={(e) => set({ notes: e.target.value })} />

        {error && <p style={S.authError}>{error}</p>}
        <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 16 }} onClick={submit} disabled={busy}>
          <Check size={16} /> {busy ? "Invio…" : "Invia questionario"}
        </button>
      </div>
    </div>
  );
}
