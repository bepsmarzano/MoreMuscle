import { useState } from "react";
import { Dumbbell, LogIn } from "lucide-react";
import { S, globalCss } from "../shared/ui.jsx";
import { supabase } from "../lib/supabaseClient.js";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Email o password non corrette." : error.message);
  };

  return (
    <div style={S.app}>
      <style>{globalCss}</style>
      <div style={S.authWrap}>
        <form style={S.authCard} onSubmit={submit}>
          <div style={S.logoMarkBig}><Dumbbell size={26} /></div>
          <div style={S.authTitle}>MORE MUSCLE</div>
          <p style={S.authSub}>Accedi per continuare</p>

          <div style={S.formGap}>
            <div>
              <label style={S.fieldLbl}>Email</label>
              <input style={S.fieldInput} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label style={S.fieldLbl}>Password</label>
              <input style={S.fieldInput} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </div>

          {error && <p style={S.authError}>{error}</p>}
          <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center", marginTop: 16 }} type="submit" disabled={busy}>
            <LogIn size={16} /> {busy ? "Accesso…" : "Accedi"}
          </button>
          <p style={{ ...S.muted, textAlign: "center", marginTop: 14 }}>
            Sei un atleta appena invitato? Usa il link ricevuto per email per impostare la password.
          </p>
        </form>
      </div>
    </div>
  );
}
