import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { S } from "../shared/ui.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Impostazioni globali: testo istruzioni + numero WhatsApp mostrati nella
// pagina iniziale che ogni atleta vede dopo il login (AthleteHome.jsx).
// ---------------------------------------------------------------------------
export default function AppSettings() {
  const [instructionsText, setInstructionsText] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.getAppSettings();
        if (alive && s) { setInstructionsText(s.instructions_text || ""); setWhatsappNumber(s.whatsapp_number || ""); }
      } catch (e) {
        if (alive) setError(e.message || "Errore nel caricamento impostazioni.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const save = async () => {
    setSaving(true); setError(""); setSaved(false);
    try {
      await api.saveAppSettings({ instructionsText, whatsappNumber });
      setSaved(true);
    } catch (e) {
      setError(e.message || "Salvataggio non riuscito.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={S.muted}>Caricamento…</p>;

  return (
    <div>
      <div style={S.sectionRow}>
        <div>
          <h2 style={S.h2}>Impostazioni</h2>
          <p style={S.muted}>Testo e contatto mostrati nella pagina iniziale dell'atleta, dopo il login</p>
        </div>
      </div>

      {error && <p style={S.authError}>{error}</p>}

      <label style={S.fieldLbl}>Istruzioni per l'atleta</label>
      <textarea
        style={{ ...S.fieldInput, height: 120, resize: "vertical" }}
        value={instructionsText}
        onChange={(e) => setInstructionsText(e.target.value)}
        placeholder='Es. Premi "Vai agli allenamenti" per vedere cosa devi fare oggi…'
      />

      <label style={S.fieldLbl}>Numero WhatsApp (con prefisso internazionale)</label>
      <input
        style={S.fieldInput}
        value={whatsappNumber}
        onChange={(e) => setWhatsappNumber(e.target.value)}
        placeholder="Es. +39 333 1234567"
      />

      <button style={{ ...S.primaryBtn, marginTop: 16 }} onClick={save} disabled={saving}>
        <Check size={16} /> {saving ? "Salvataggio…" : "Salva"}
      </button>
      {saved && <p style={S.authNote}>Salvato.</p>}
    </div>
  );
}
