// More Muscle — migrazione una tantum: converte le GIF esercizio (su
// Supabase Storage, o ancora su Google Drive per chi non era mai stato
// migrato) in video MP4 (H.264) molto più leggeri, a parità di qualità
// visiva — GIF usa una tavolozza di 256 colori per fotogramma, un video
// comprime il movimento vero e proprio: stesso contenuto, 30-50 volte meno
// banda. Risolve il problema di "cached egress" di Supabase (una libreria
// da 4,4 GB con 222 file diventa ~150 MB).
//
// Aggiorna ogni posto dove un URL GIF è salvato: la libreria esercizi
// (fonte di verità) E le copie denormalizzate dentro ai Programmi
// Riscaldamento/Forza/Circuito — poi elimina la GIF vecchia da Supabase
// Storage (se era lì) per liberare spazio.
//
// Uso (PowerShell, dalla cartella del progetto):
//   1. installa ffmpeg se non ce l'hai già: choco install ffmpeg -y
//   2. .env.migration.local con SUPABASE_SERVICE_ROLE_KEY=... (vedi
//      migrate-gifs-to-storage.mjs per i dettagli — stesso file, riusato)
//   3. node --env-file=.env.local --env-file=.env.migration.local scripts/migrate-gifs-to-video.mjs
//
// Sicuro da rilanciare più volte: gli esercizi il cui link punta già a un
// .mp4 vengono riconosciuti e saltati.

import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "exercise-gifs";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Mancano VITE_SUPABASE_URL e/o SUPABASE_SERVICE_ROLE_KEY. Vedi le istruzioni in cima a questo file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const alreadyVideo = (url) => typeof url === "string" && /\.mp4(\?|$)/i.test(url);
const isOurBucket = (url) => typeof url === "string" && url.includes(`/storage/v1/object/public/${BUCKET}/`);

// scarica l'originale (GIF, da Supabase o ancora da Google per chi non era
// mai stato migrato), lo converte in MP4 con ffmpeg, ricarica il risultato.
async function downloadConvertUpload(id, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const gifBuf = Buffer.from(await res.arrayBuffer());

  const dir = await mkdtemp(path.join(tmpdir(), "mm-gif2mp4-"));
  const gifPath = path.join(dir, "in.gif");
  const mp4Path = path.join(dir, "out.mp4");
  try {
    await writeFile(gifPath, gifBuf);
    // scale: mai più larga di 720px (i fotogrammi di partenza sono comunque
    // modesti — è la codifica GIF a pesare, non la risoluzione), -2 tiene
    // l'altezza pari come richiede yuv420p. CRF 23 = qualità alta, testata
    // visivamente su un campione prima di lanciare tutta la libreria.
    await execFileAsync(FFMPEG, [
      "-y", "-i", gifPath,
      "-vf", "scale='min(720,iw)':-2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "23", "-preset", "medium",
      "-movflags", "+faststart", "-an",
      mp4Path,
    ], { timeout: 120000 });

    const mp4Buf = await readFile(mp4Path);
    const storagePath = `${id}.mp4`;
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, mp4Buf, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`upload: ${error.message}`);
    return {
      newUrl: supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl,
      beforeBytes: gifBuf.length,
      afterBytes: mp4Buf.length,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
  // verifica ffmpeg prima di iniziare, altrimenti si scopre solo al primo fallimento
  try {
    await execFileAsync(FFMPEG, ["-version"]);
  } catch {
    console.error(`ffmpeg non trovato (${FFMPEG}). Installalo (choco install ffmpeg -y) e riprova, o imposta FFMPEG_PATH.`);
    process.exit(1);
  }

  const urlMap = new Map(); // vecchio URL (GIF) -> nuovo URL (MP4)
  const oldGifPathsToDelete = []; // path nel nostro bucket da eliminare a fine giro
  const failures = [];
  let totalBefore = 0, totalAfter = 0;

  console.log("1) Libreria esercizi — converto ogni GIF non ancora in video…");
  const { data: libRows, error: libErr } = await supabase.from("library").select("owner_id, exercises");
  if (libErr) throw libErr;

  for (const row of libRows) {
    const exercises = row.exercises || [];
    for (const ex of exercises) {
      if (!ex.gif || alreadyVideo(ex.gif) || urlMap.has(ex.gif)) continue;
      try {
        const { newUrl, beforeBytes, afterBytes } = await downloadConvertUpload(ex.id, ex.gif);
        urlMap.set(ex.gif, newUrl);
        totalBefore += beforeBytes; totalAfter += afterBytes;
        if (isOurBucket(ex.gif)) oldGifPathsToDelete.push(`${ex.id}.gif`);
        console.log(`  OK   ${ex.name}  (${(beforeBytes / 1024 / 1024).toFixed(1)}MB -> ${(afterBytes / 1024 / 1024).toFixed(2)}MB)`);
      } catch (e) {
        failures.push({ name: ex.name, gif: ex.gif, error: e.message });
        console.warn(`  FAIL ${ex.name}: ${e.message}`);
      }
    }
    let changed = false;
    for (const ex of exercises) if (urlMap.has(ex.gif)) { ex.gif = urlMap.get(ex.gif); changed = true; }
    if (changed) {
      const { error } = await supabase.from("library").update({ exercises, updated_at: new Date().toISOString() }).eq("owner_id", row.owner_id);
      if (error) throw error;
    }
  }
  console.log(`Libreria: ${urlMap.size} convertite, ${failures.length} fallite.`);
  if (totalBefore > 0) {
    console.log(`Peso: ${(totalBefore / 1024 / 1024).toFixed(0)}MB -> ${(totalAfter / 1024 / 1024).toFixed(0)}MB (${(totalBefore / Math.max(totalAfter, 1)).toFixed(1)}x più leggero)\n`);
  }

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

  console.log(`\n3) Elimino ${oldGifPathsToDelete.length} GIF vecchie dal bucket (rimpiazzate dal video)…`);
  for (let i = 0; i < oldGifPathsToDelete.length; i += 100) {
    const batch = oldGifPathsToDelete.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) console.warn(`  Attenzione: eliminazione batch non riuscita: ${error.message}`);
  }

  if (failures.length) {
    console.log("\nGIF NON convertite (URL originale lasciato invariato, da controllare a mano):");
    failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}\n    ${f.gif}`));
  }
}

main()
  .then(() => { console.log("\nFatto."); process.exit(0); })
  .catch((e) => { console.error("\nErrore:", e); process.exit(1); });
