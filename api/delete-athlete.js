import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Funzione serverless Vercel — gemella di invite-athlete.js: stessa verifica
// "chi chiama è davvero un admin loggato", stessa service role key (mai
// esposta al browser). Elimina l'utente Supabase dell'atleta:
// profiles/questionnaire_responses/athlete_maxes/exercise_logs hanno tutti
// "on delete cascade" su auth.users, quindi si ripuliscono da soli.
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Configurazione server incompleta (VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Token mancante." });
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) il token appartiene a un utente reale?
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: "Sessione non valida." });
    return;
  }

  // 2) quell'utente è admin?
  const { data: callerProfile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || callerProfile?.role !== "admin") {
    res.status(403).json({ error: "Non autorizzato." });
    return;
  }

  const { athleteId } = req.body || {};
  if (!athleteId || typeof athleteId !== "string") {
    res.status(400).json({ error: "athleteId obbligatorio." });
    return;
  }
  if (athleteId === userData.user.id) {
    res.status(400).json({ error: "Non puoi eliminare il tuo stesso account." });
    return;
  }

  // 3) il bersaglio è davvero un atleta, non un altro admin (di sicurezza in più)
  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", athleteId)
    .single();
  if (targetError || targetProfile?.role !== "athlete") {
    res.status(400).json({ error: "Utente non trovato o non eliminabile." });
    return;
  }

  const { error } = await admin.auth.admin.deleteUser(athleteId);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(200).json({ ok: true });
}
