import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Funzione serverless Vercel: testo -> URL di un mp3 con la voce ElevenLabs.
// Unico posto che tocca ELEVENLABS_API_KEY (mai esposta al browser).
//
// Cache-first: ogni frase esatta genera un file nel bucket Storage
// "tts-cache", con nome derivato da un hash del testo (+ voce + modello, così
// cambiare voce non serve nemmeno svuotare la cache — semplicemente cambia
// hash e si ripopola da sola). Alla richiesta successiva della stessa frase
// si serve il file già esistente: niente nuova chiamata a ElevenLabs, niente
// attesa. Stessa logica già usata per le GIF esercizio: si genera una volta
// sola, si riserve per sempre.
//
// Qualunque utente loggato (non solo admin) può chiamarla: serve durante
// l'allenamento sia all'atleta che all'admin in fase di test. Il controllo
// del bearer token serve solo a tenere fuori chi non è un utente reale
// dell'app (altrimenti chiunque scoprisse l'URL potrebbe consumare la quota
// ElevenLabs a piacere).
// ---------------------------------------------------------------------------
const BUCKET = "tts-cache";
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const elevenApiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!supabaseUrl || !serviceRoleKey || !elevenApiKey || !voiceId) {
    res.status(500).json({ error: "Configurazione server incompleta (Supabase o ElevenLabs)." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Token mancante." });
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: "Sessione non valida." });
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "Testo obbligatorio." });
    return;
  }
  // limite di sicurezza: un annuncio del Player è sempre una frase corta,
  // niente testo arbitrario lunghissimo a spese della quota ElevenLabs
  const clean = text.trim().slice(0, 300);

  const hash = createHash("sha256").update(`${MODEL_ID}:${voiceId}:${clean}`).digest("hex").slice(0, 32);
  const storagePath = `${hash}.mp3`;
  const publicUrl = admin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

  // cache hit? un HEAD sul bucket pubblico basta, niente bisogno di scaricare
  // il file solo per sapere se esiste già.
  try {
    const head = await fetch(publicUrl, { method: "HEAD" });
    if (head.ok) {
      res.status(200).json({ url: publicUrl, cached: true });
      return;
    }
  } catch {
    // rete instabile sul controllo cache: proviamo comunque a generare sotto
  }

  // cache miss: genera con ElevenLabs
  let audioBuf;
  try {
    const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": elevenApiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: clean, model_id: MODEL_ID, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!elevenRes.ok) {
      const detail = await elevenRes.text().catch(() => "");
      res.status(502).json({ error: `ElevenLabs: ${elevenRes.status} ${detail}`.slice(0, 500) });
      return;
    }
    audioBuf = Buffer.from(await elevenRes.arrayBuffer());
  } catch (e) {
    res.status(502).json({ error: `Chiamata a ElevenLabs non riuscita: ${e.message}` });
    return;
  }

  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, audioBuf, { contentType: "audio/mpeg", upsert: true });
  if (upErr) {
    // upload fallito ma abbiamo comunque l'audio pronto: meglio rispondere
    // con l'errore che fingere una cache riuscita che non c'è
    res.status(500).json({ error: `Salvataggio cache non riuscito: ${upErr.message}` });
    return;
  }

  res.status(200).json({ url: publicUrl, cached: false });
}
