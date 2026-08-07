import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Funzione serverless Vercel (root /api, non /src — Vite non la serve in dev:
// serve `vercel dev` in locale, oppure testarla dopo un deploy).
//
// Unico posto dell'app che usa la SERVICE ROLE KEY (mai esposta al browser):
// crea l'utente Supabase invitato via auth.admin.inviteUserByEmail(). Prima
// verifica che chi chiama sia davvero un admin loggato, altrimenti chiunque
// scoprisse l'URL potrebbe invitare email a piacere.
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

  const { email, fullName } = req.body || {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email obbligatoria." });
    return;
  }

  const origin = req.headers.origin || `https://${req.headers.host}`;
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName || null },
    redirectTo: `${origin}/set-password`,
  });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(200).json({ ok: true, userId: data?.user?.id });
}
