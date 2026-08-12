import { supabase } from "./supabaseClient";

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user?.id ?? null;
}

// ---- profilo/sessione -------------------------------------------------------
export async function getMyProfile() {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
  if (error) throw error;
  return data;
}

// ---- libreria esercizi (solo admin) -----------------------------------------
export async function getLibrary() {
  const uid = await currentUserId();
  const { data, error } = await supabase.from("library").select("exercises").eq("owner_id", uid).maybeSingle();
  if (error) throw error;
  return data?.exercises ?? [];
}

export async function saveLibrary(exercises) {
  const uid = await currentUserId();
  const { error } = await supabase
    .from("library")
    .upsert({ owner_id: uid, exercises, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---- programmi Riscaldamento / Forza / Circuito riusabili (admin) ------------
// stessa forma per tutti e tre: { id, name, sessions: [...] } — ogni elemento
// di `sessions` è rispettivamente un blocco "standard" (riscaldamento), un
// blocco "strength", o un blocco "standard" (circuito, 2 per sessione).
function rowToProgram(row) {
  return { id: row.id, name: row.name, sessions: row.sessions || [] };
}

export async function listWarmupPrograms() {
  const { data, error } = await supabase.from("warmup_programs").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(rowToProgram);
}

export async function saveWarmupProgram(program) {
  const uid = await currentUserId();
  const row = { ...(program.id ? { id: program.id } : {}), owner_id: uid, name: program.name, sessions: program.sessions || [] };
  const { data, error } = await supabase.from("warmup_programs").upsert(row).select().single();
  if (error) throw error;
  return rowToProgram(data);
}

export async function deleteWarmupProgram(id) {
  const { error } = await supabase.from("warmup_programs").delete().eq("id", id);
  if (error) throw error;
}

export async function listStrengthPrograms() {
  const { data, error } = await supabase.from("strength_programs").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(rowToProgram);
}

export async function saveStrengthProgram(program) {
  const uid = await currentUserId();
  const row = { ...(program.id ? { id: program.id } : {}), owner_id: uid, name: program.name, sessions: program.sessions || [] };
  const { data, error } = await supabase.from("strength_programs").upsert(row).select().single();
  if (error) throw error;
  return rowToProgram(data);
}

export async function deleteStrengthProgram(id) {
  const { error } = await supabase.from("strength_programs").delete().eq("id", id);
  if (error) throw error;
}

export async function listCircuitPrograms() {
  const { data, error } = await supabase.from("circuit_programs").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(rowToProgram);
}

export async function saveCircuitProgram(program) {
  const uid = await currentUserId();
  const row = { ...(program.id ? { id: program.id } : {}), owner_id: uid, name: program.name, sessions: program.sessions || [] };
  const { data, error } = await supabase.from("circuit_programs").upsert(row).select().single();
  if (error) throw error;
  return rowToProgram(data);
}

export async function deleteCircuitProgram(id) {
  const { error } = await supabase.from("circuit_programs").delete().eq("id", id);
  if (error) throw error;
}

// una sessione di un Programma Circuito ha 2 blocchi standard (con riposo a
// cronometro tra i due, come tra qualunque blocco di primo livello — vedi
// buildSequence in WorkoutPlayer.jsx). Tollera anche la vecchia forma "un
// blocco solo" (sessioni create prima di questa modifica).
export function circuitSessionToBlocks(session) {
  const blocks = session?.blocks || [{ exercises: session?.exercises || [], rounds: session?.rounds || 1 }];
  return blocks.map((b) => ({ exercises: b.exercises || [], rounds: b.rounds || 1 }));
}

// ---- atleti (admin) -----------------------------------------------------------
// join via la relazione questionnaire_responses.athlete_id -> profiles.id
export async function listAthletes() {
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id, email, full_name, created_at,
      assigned_warmup_program_id, warmup_position,
      assigned_strength_program_id, strength_position,
      assigned_circuit_program_id, circuit_position,
      questionnaire_responses(goal, level, injuries, days_per_week, equipment, notes, updated_at)
    `)
    .eq("role", "athlete")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((p) => ({ ...p, questionnaire: p.questionnaire_responses?.[0] || p.questionnaire_responses || null }));
}

// ---- assegnazioni (admin) — le 3 sezioni sono indipendenti, ognuna con la
// propria RPC di assegnazione (azzera anche la posizione di quella sezione) ---
export async function assignWarmupProgram(athleteId, programId) {
  const { error } = await supabase.rpc("admin_assign_warmup_program", { p_athlete_id: athleteId, p_program_id: programId });
  if (error) throw error;
}

export async function assignStrengthProgram(athleteId, programId) {
  const { error } = await supabase.rpc("admin_assign_strength_program", { p_athlete_id: athleteId, p_program_id: programId });
  if (error) throw error;
}

export async function assignCircuitProgram(athleteId, programId) {
  const { error } = await supabase.rpc("admin_assign_circuit_program", { p_athlete_id: athleteId, p_program_id: programId });
  if (error) throw error;
}

// ---- massimali (admin gestisce, atleta legge il proprio) ------------------------
export async function getAthleteMaxes(athleteId) {
  const { data, error } = await supabase.from("athlete_maxes").select("*").eq("athlete_id", athleteId);
  if (error) throw error;
  return data;
}

export async function setAthleteMax(athleteId, liftKey, maxKg) {
  const { error } = await supabase
    .from("athlete_maxes")
    .upsert({ athlete_id: athleteId, lift_key: liftKey, max_kg: maxKg, updated_at: new Date().toISOString() }, { onConflict: "athlete_id,lift_key" });
  if (error) throw error;
}

// ---- log annotati dall'atleta durante l'allenamento -------------------------------
// reps: ripetizioni fatte in una serie AMRAP della Forza.
// loadLabel: livello di carico usato in un esercizio a manubri/kettlebell del Circuito.
export async function logExerciseSet({ athleteId, exerciseName, reps, loadLabel }) {
  const { error } = await supabase.from("exercise_logs").insert({
    athlete_id: athleteId,
    exercise_name: exerciseName,
    reps: reps ?? null,
    load_label: loadLabel ?? null,
  });
  if (error) throw error;
}

export async function getExerciseLogs(athleteId, limit = 20) {
  const { data, error } = await supabase
    .from("exercise_logs")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("logged_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function inviteAthlete({ email, fullName }) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Sessione non valida, rifai il login.");
  const res = await fetch("/api/invite-athlete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, fullName }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Invito non riuscito.");
  return body;
}

// ---- questionario (atleta) -----------------------------------------------------
export async function getQuestionnaire(athleteId) {
  const { data, error } = await supabase.from("questionnaire_responses").select("*").eq("athlete_id", athleteId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveQuestionnaire(athleteId, answers) {
  const { error } = await supabase
    .from("questionnaire_responses")
    .upsert({ athlete_id: athleteId, ...answers, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---- impostazioni globali (testo istruzioni + numero WhatsApp) --------------
// riga singola (id=1): letta da tutti (serve nella pagina iniziale atleta),
// scritta solo dall'admin (pannello Impostazioni).
export async function getAppSettings() {
  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveAppSettings({ instructionsText, whatsappNumber }) {
  const { error } = await supabase
    .from("app_settings")
    .update({ instructions_text: instructionsText, whatsapp_number: whatsappNumber, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

// ---- le 3 sezioni (atleta): indipendenti, ognuna con la propria posizione ------
// Nessuna riga "sessione" salvata: si assembla al volo dalla libreria
// assegnata, alla posizione corrente dell'atleta per QUELLA sezione. Ognuna
// ritorna: null (niente assegnato) | { done: true, total } (finita) |
// { id, name, restBetweenBlocks, blocks } (la sessione da eseguire).

// il riscaldamento ruota all'infinito sulle sessioni del programma assegnato:
// non "finisce" mai, quindi non ha uno stato done — se è assegnato, c'è
// sempre un prossimo riscaldamento.
export async function getNextWarmup(profile) {
  if (!profile?.assigned_warmup_program_id) return null;
  const { data, error } = await supabase.from("warmup_programs").select("*").eq("id", profile.assigned_warmup_program_id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const sessions = data.sessions || [];
  if (sessions.length === 0) return null;
  const i = (profile.warmup_position || 0) % sessions.length;
  return {
    id: `warmup-${data.id}-${i}`,
    name: sessions.length > 1 ? `${data.name} — Sessione ${i + 1}/${sessions.length}` : data.name,
    restBetweenBlocks: 0, // un solo blocco: nessun riposo tra blocchi da mostrare
    blocks: [{ id: "w", type: "standard", exercises: sessions[i].exercises || [], rounds: sessions[i].rounds || 1 }],
  };
}

export async function completeWarmup() {
  const { error } = await supabase.rpc("complete_warmup");
  if (error) throw error;
}

export async function getNextStrengthSession(profile) {
  if (!profile?.assigned_strength_program_id) return null;
  const { data, error } = await supabase.from("strength_programs").select("*").eq("id", profile.assigned_strength_program_id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const sessions = data.sessions || [];
  const i = profile.strength_position || 0;
  if (sessions.length === 0 || i >= sessions.length) return { done: true, total: sessions.length };
  return {
    id: `strength-${data.id}-${i}`,
    name: `${data.name} — Sessione ${i + 1}/${sessions.length}`,
    restBetweenBlocks: 0,
    blocks: [{ id: "f", type: "strength", ...sessions[i] }],
  };
}

export async function completeStrengthSession() {
  const { error } = await supabase.rpc("complete_strength_session");
  if (error) throw error;
}

export async function getNextCircuitSession(profile) {
  if (!profile?.assigned_circuit_program_id) return null;
  const { data, error } = await supabase.from("circuit_programs").select("*").eq("id", profile.assigned_circuit_program_id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const sessions = data.sessions || [];
  const i = profile.circuit_position || 0;
  if (sessions.length === 0 || i >= sessions.length) return { done: true, total: sessions.length };
  const blocks = circuitSessionToBlocks(sessions[i]).map((b, bj) => ({ id: `c${bj}`, type: "standard", ...b }));
  return {
    id: `circuit-${data.id}-${i}`,
    name: `${data.name} — Sessione ${i + 1}/${sessions.length}`,
    restBetweenBlocks: 120, // riposo a cronometro tra i 2 blocchi del circuito
    blocks,
  };
}

export async function completeCircuitSession() {
  const { error } = await supabase.rpc("complete_circuit_session");
  if (error) throw error;
}
