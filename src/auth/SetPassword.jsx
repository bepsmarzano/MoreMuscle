import { useState, useEffect } from "react";
import { KeyRound } from "lucide-react";
import { S, globalCss } from "../shared/ui.jsx";
import { supabase } from "../lib/supabaseClient.js";

// il link di invito è monouso: se è già stato aperto in precedenza (anche
// per errore, es. da uno scanner email o un tap doppio) o è scaduto,
// detectSessionInUrl non riesce a stabilire una sessione — invece del
// messaggio grezzo di Supabase ("Auth session missing!"), qualcosa che
// l'atleta capisce e sa come risolvere.
const friendlyAuthError = (msg) =>
  msg && /session/i.test(msg)
    ? "Questo link non è più valido — probabilmente è già stato aperto in precedenza, o è scaduto. Chiedi al tuo allenatore di mandartene uno nuovo."
    : msg || "Errore sconosciuto.";

// Pagina mostrata quando l'URL è /set-password: ci si arriva dal link di
// invito via email, che supabase-js trasforma già in una sessione valida
// (detectSessionInUrl è attivo di default). Qui l'atleta invitato sceglie la
// sua password reale al posto di quella temporanea generata dall'invito.
export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [linkValid, setLinkValid] = useState(false);

  // verifica SUBITO se il link ha creato una sessione valida, invece di
  // scoprirlo solo dopo che l'atleta ha già compilato il modulo — getSession()
  // attende comunque che detectSessionInUrl abbia finito, quindi il risultato
  // qui è già quello definitivo.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (alive) { setLinkValid(!!data?.session); setCheckingLink(false); }
    })();
    return () => { alive = false; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { setError("La password deve avere almeno 8 caratteri."); return; }
    if (password !== confirm) { setError("Le due password non coincidono."); return; }
    setBusy(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setError(friendlyAuthError(error.message)); return; }
    setDone(true);
    // tolto /set-password dall'URL e si ricarica: l'AuthProvider riparte da
    // capo e, con la sessione già valida, indirizza subito alla vista giusta.
    window.history.replaceState({}, "", "/");
    window.location.reload();
  };

  if (checkingLink) {
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        <div style={S.authWrap}><p style={S.muted}>Verifica del link…</p></div>
      </div>
    );
  }

  if (!linkValid) {
    return (
      <div style={S.app}>
        <style>{globalCss}</style>
        <div style={S.authWrap}>
          <div style={S.authCard}>
            <img src="/logo.png" alt="Viltrum Fitness" style={S.logoImgBig} />
            <div style={S.authTitle}>Link non valido</div>
            <p style={S.authSub}>
              Questo link non è più valido — probabilmente è già stato aperto in precedenza, o è scaduto. Chiedi al tuo allenatore di mandartene uno nuovo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{globalCss}</style>
      <div style={S.authWrap}>
        <form style={S.authCard} onSubmit={submit}>
          <img src="/logo.png" alt="Viltrum Fitness" style={S.logoImgBig} />
          <div style={S.authTitle}>Imposta la password</div>
          <p style={S.authSub}>Benvenuto/a! Scegli una password per accedere al tuo account.</p>

          <div style={S.formGap}>
            <div>
              <label style={S.fieldLbl}>Nuova password</label>
              <input style={S.fieldInput} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label style={S.fieldLbl}>Ripeti password</label>
              <input style={S.fieldInput} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
          </div>

          {error && <p style={S.authError}>{error}</p>}
          {done && <p style={S.authNote}>Password impostata, accesso in corso…</p>}
          <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 16 }} type="submit" disabled={busy || done}>
            <KeyRound size={16} /> {busy ? "Salvataggio…" : "Imposta password"}
          </button>
        </form>
      </div>
    </div>
  );
}
