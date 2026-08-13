import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { S } from "../shared/ui.jsx";
import * as api from "../lib/api.js";

// ---------------------------------------------------------------------------
// Profilo atleta (self-service): nome — prima lo impostava solo l'admin
// all'invito — e massimali per i sollevamenti usati dal Programma Forza
// assegnato in questo momento, che servono a calcolare in automatico il peso
// di lavoro nel blocco Forza (percentuale × massimale) senza passare
// dall'admin. onSaved: chiamato dopo aver salvato il nome, per far
// ricaricare il profilo al chiamante (l'header mostra il nome aggiornato).
// ---------------------------------------------------------------------------
export default function Profile({ profile, onSaved }) {
  const [fullName, setFullName] = useState(profile.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [lifts, setLifts] = useState([]); // [{ key, name }] — key = id libreria dell'esercizio
  const [maxes, setMaxes] = useState({}); // { [key]: "kg" }
  const [loadingMaxes, setLoadingMaxes] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [assignedLifts, rows] = await Promise.all([api.getMyAssignedLifts(profile), api.getMyMaxes()]);
        if (!alive) return;
        setLifts(assignedLifts);
        const map = {};
        rows.forEach((r) => { map[r.lift_key] = String(r.max_kg); });
        setMaxes(map);
      } catch (e) {
        if (alive) setError(e.message || "Errore nel caricamento dei massimali.");
      } finally {
        if (alive) setLoadingMaxes(false);
      }
    })();
    return () => { alive = false; };
  }, [profile]);

  const saveName = async () => {
    if (!fullName.trim()) return;
    setSavingName(true); setNameSaved(false); setError("");
    try {
      await api.updateMyName(fullName.trim());
      setNameSaved(true);
      await onSaved?.();
    } catch (e) {
      setError(e.message || "Salvataggio nome non riuscito.");
    } finally {
      setSavingName(false);
    }
  };

  const saveMax = async (liftKey, value) => {
    const kg = +value;
    if (!kg || kg <= 0) return;
    try {
      await api.setMyMax(liftKey, kg);
    } catch (e) {
      setError(e.message || "Salvataggio massimale non riuscito.");
    }
  };

  return (
    <div>
      <h2 style={S.h2}>Il tuo profilo</h2>
      {error && <p style={S.authError}>{error}</p>}

      <label style={S.fieldLbl}>Nome e cognome</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input style={S.fieldInput} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Es. Mario Rossi" />
        <button style={S.primaryBtn} onClick={saveName} disabled={savingName}><Check size={16} /> Salva</button>
      </div>
      {nameSaved && <p style={S.authNote}>Salvato.</p>}

      <div style={{ ...S.blockLabel, marginTop: 24, marginBottom: 8, display: "block" }}>MASSIMALI</div>
      {loadingMaxes ? (
        <p style={S.muted}>Caricamento…</p>
      ) : lifts.length === 0 ? (
        <p style={S.muted}>Nessun programma Forza assegnato al momento — non c'è ancora nessun massimale da inserire.</p>
      ) : (
        <>
          <p style={{ ...S.muted, marginBottom: 12 }}>Usati per calcolare in automatico il peso da usare nella parte di Forza.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lifts.map(({ key, name }) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={S.qValue}>{name}</span>
                <input type="number" min={0} style={{ ...S.numInput, marginTop: 0 }} defaultValue={maxes[key] || ""}
                  placeholder="kg" onBlur={(e) => saveMax(key, e.target.value)} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
