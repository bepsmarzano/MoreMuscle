// More Muscle — migrazione una tantum: scarica le GIF esercizio dai loro
// link Google Drive/Photos attuali e le ricarica su Supabase Storage
// (bucket "exercise-gifs", creato da supabase/migration_gif_storage.sql),
// poi aggiorna ogni posto dove un URL GIF è salvato: la libreria esercizi
// (fonte di verità) E le copie denormalizzate dentro ai Programmi
// Riscaldamento/Forza/Circuito (ogni sessione porta con sé la propria copia
// di {name, gif, ...} al momento in cui è stata composta — vedi fromLib in
// src/admin/blockEditors.jsx — quindi cambiare solo la libreria non basta).
//
// Uso (PowerShell, dalla cartella del progetto):
//   1. crea un file .env.migration.local con dentro una riga:
//        SUPABASE_SERVICE_ROLE_KEY=eyJ...
//      (la trovi su Supabase -> Project Settings -> API -> service_role.
//      Il file finisce in .gitignore da solo grazie al pattern "*.local":
//      non va mai committato né messo in .env.local)
//   2. node --env-file=.env.local --env-file=.env.migration.local scripts/migrate-gifs-to-storage.mjs
//
// Sicuro da rilanciare più volte: le GIF già su Supabase Storage vengono
// riconosciute e saltate.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "exercise-gifs";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Mancano VITE_SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY. Vedi le istruzioni in cima a questo file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const alreadyMigrated = (url) => typeof url === "string" && url.includes(`/storage/v1/object/public/${BUCKET}/`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// un paio di esercizi avevano il link di condivisione di Google Drive
// incollato per errore dentro al prefisso lh3 invece del link diretto (es.
// "https://lh3.googleusercontent.com/d/https://drive.google.com/file/d/ID/view?...")
// — lo riconosciamo e lo ricostruiamo nella forma diretta corretta.
function fixMalformedUrl(url) {
  const m = typeof url === "string" && url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : url;
}

// i "fetch failed" visti nella prima passata erano quasi tutti concentrati
// in un'unica finestra (poi tutto è tornato normale): un blip di rete
// transitorio, non link morti — qualche tentativo in più con backoff basta
// a recuperarli senza dover rilanciare tutto lo script a mano.
async function downloadAndUpload(id, url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") || "image/gif";
      const path = `${id}.gif`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true });
      if (error) throw new Error(`upload: ${error.message}`);
      return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await sleep(1000 * 2 ** i); // 1s, 2s
    }
  }
  throw lastErr;
}

// applica patchSession a ogni sessione di ogni riga di `table` (colonna
// `sessions` jsonb); patchSession muta l'oggetto e ritorna true se ha cambiato qualcosa.
async function patchProgramsTable(table, patchSession) {
  const { data: rows, error } = await supabase.from(table).select("id, sessions");
  if (error) throw error;
  let touched = 0;
  for (const row of rows) {
    const sessions = row.sessions || [];
    let changed = false;
    for (const session of sessions) if (patchSession(session)) changed = true;
    if (changed) {
      const { error: upErr } = await supabase.from(table).update({ sessions }).eq("id", row.id);
      if (upErr) throw upErr;
      touched++;
    }
  }
  console.log(`${table}: ${touched} programmi aggiornati.`);
}

async function main() {
  const urlMap = new Map(); // vecchio URL Google -> nuovo URL Supabase Storage
  const failures = [];

  // alza il limite di dimensione del bucket (alcune GIF superano il default
  // lasciato alla creazione — vedi supabase/migration_gif_size_limit.sql,
  // che fa la stessa cosa via SQL: questa chiamata la rende automatica a
  // ogni run, così non serve rieseguirla a mano).
  const { error: bucketErr } = await supabase.storage.updateBucket(BUCKET, { public: true, fileSizeLimit: 104857600 });
  if (bucketErr) console.warn(`Attenzione: non sono riuscito ad alzare il limite del bucket (${bucketErr.message}) — le GIF più pesanti potrebbero fallire di nuovo.`);

  console.log("1) Libreria esercizi — scarico e ricarico ogni GIF non ancora migrata…");
  const { data: libRows, error: libErr } = await supabase.from("library").select("owner_id, exercises");
  if (libErr) throw libErr;

  for (const row of libRows) {
    const exercises = row.exercises || [];
    let anyUrlFixed = false;
    for (const ex of exercises) {
      const fixed = fixMalformedUrl(ex.gif);
      if (fixed !== ex.gif) { ex.gif = fixed; anyUrlFixed = true; } // persisti la riparazione anche se poi il fetch fallisce ancora
      if (!ex.gif || alreadyMigrated(ex.gif) || urlMap.has(ex.gif)) continue;
      try {
        const newUrl = await downloadAndUpload(ex.id, ex.gif);
        urlMap.set(ex.gif, newUrl);
        console.log(`  OK   ${ex.name}`);
      } catch (e) {
        failures.push({ name: ex.name, gif: ex.gif, error: e.message });
        console.warn(`  FAIL ${ex.name}: ${e.message}`);
      }
      await sleep(150); // un po' di cortesia verso i server Google, niente raffiche
    }
    let changed = anyUrlFixed;
    for (const ex of exercises) if (urlMap.has(ex.gif)) { ex.gif = urlMap.get(ex.gif); changed = true; }
    if (changed) {
      const { error } = await supabase.from("library").update({ exercises, updated_at: new Date().toISOString() }).eq("owner_id", row.owner_id);
      if (error) throw error;
    }
  }
  console.log(`Libreria: ${urlMap.size} GIF migrate, ${failures.length} fallite.\n`);

  console.log("2) Propago i nuovi URL nelle sessioni già composte nei Programmi…");
  await patchProgramsTable("warmup_programs", (session) => {
    let changed = false;
    for (const ex of session.exercises || []) if (urlMap.has(ex.gif)) { ex.gif = urlMap.get(ex.gif); changed = true; }
    return changed;
  });
  await patchProgramsTable("strength_programs", (session) => {
    if (urlMap.has(session.exerciseGif)) { session.exerciseGif = urlMap.get(session.exerciseGif); return true; }
    return false;
  });
  await patchProgramsTable("circuit_programs", (session) => {
    let changed = false;
    const blocks = session.blocks || [{ exercises: session.exercises || [] }];
    for (const block of blocks) {
      for (const ex of block.exercises || []) if (urlMap.has(ex.gif)) { ex.gif = urlMap.get(ex.gif); changed = true; }
    }
    return changed;
  });

  if (failures.length) {
    console.log("\nGIF NON migrate (URL originale lasciato invariato, da controllare a mano):");
    failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}\n    ${f.gif}`));
  }
}

main()
  .then(() => { console.log("\nFatto."); process.exit(0); })
  .catch((e) => { console.error("\nErrore:", e); process.exit(1); });
