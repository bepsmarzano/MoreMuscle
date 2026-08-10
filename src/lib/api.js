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

// ---- riscaldamenti riusabili (admin) -----------------------------------------
function rowToWarmup(row) {
  return { id: row.id, name: row.name, exercises: row.exercises || [], rounds: row.rounds || 1 };
}

export async function listWarmupBlocks() {
  const { data, error } = await supabase.from("warmup_blocks").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(rowToWarmup);
}

export async function saveWarmupBlock(block) {
  const uid = await currentUserId();
  const row = { ...(block.id ? { id: block.id } : {}), owner_id: uid, name: block.name, exercises: block.exercises || [], rounds: block.rounds || 1 };
  const { data, error } = await supabase.from("warmup_blocks").upsert(row).select().single();
  if (error) throw error;
  return rowToWarmup(data);
}

export async function deleteWarmupBlock(id) {
  const { error } = await supabase.from("warmup_blocks").delete().eq("id", id);
  if (error) throw error;
}

// ---- programmi Forza / Circuito riusabili (admin) ----------------------------
// stessa forma per entrambi: { id, name, sessions: [...] } — ogni elemento di
// `sessions` è rispettivamente un blocco "strength" o uno "standard" di oggi.
function rowToProgram(row) {
  return { id: row.id, name: row.name, sessions: row.sessions || [] };
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

// ---- piani (admin) ------------------------------------------------------------
// un piano compone: riscaldamenti in rotazione + 1 programma Forza + 1
// programma Circuito + riposo tra blocchi. Le sessioni si assemblano al volo
// (vedi getCurrentSession), non sono righe salvate.
export async function listPlans() {
  const { data, error } = await supabase.from("plans").select("id, name, created_at").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPlan(planId) {
  const { data, error } = await supabase.from("plans").select("*").eq("id", planId).single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    warmupBlockIds: data.warmup_block_ids || [],
    strengthProgramId: data.strength_program_id,
    circuitProgramId: data.circuit_program_id,
    restBetweenBlocks: data.rest_between_blocks,
  };
}

export async function savePlan(plan) {
  const uid = await currentUserId();
  const row = {
    ...(plan.id ? { id: plan.id } : {}),
    owner_id: uid,
    name: plan.name,
    warmup_block_ids: plan.warmupBlockIds || [],
    strength_program_id: plan.strengthProgramId || null,
    circuit_program_id: plan.circuitProgramId || null,
    rest_between_blocks: plan.restBetweenBlocks ?? 120,
  };
  const { data, error } = await supabase.from("plans").upsert(row).select().single();
  if (error) throw error;
  return data;
}

export async function deletePlan(id) {
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) throw error;
}

// ---- atleti (admin) -----------------------------------------------------------
// join via la relazione questionnaire_responses.athlete_id -> profiles.id
export async function listAthletes() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, assigned_plan_id, current_session_position, created_at, questionnaire_responses(goal, level, injuries, days_per_week, equipment, notes, updated_at)")
    .eq("role", "athlete")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((p) => ({ ...p, questionnaire: p.questionnaire_responses?.[0] || p.questionnaire_responses || null }));
}

export async function assignPlan(athleteId, planId) {
  const { error } = await supabase.rpc("admin_assign_plan", { p_athlete_id: athleteId, p_plan_id: planId });
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
export async function logExerciseSet({ athleteId, planId, sessionPosition, exerciseName, reps, loadLabel }) {
  const { error } = await supabase.from("exercise_logs").insert({
    athlete_id: athleteId,
    plan_id: planId ?? null,
    session_position: sessionPosition ?? null,
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

// ---- sessione corrente del piano assegnato (atleta) ---------------------------------
// Nessuna riga "sessione" salvata: si assembla al volo dalle tre librerie del
// piano, alla posizione corrente dell'atleta. Ritorna:
//  - null                          -> nessun piano assegnato
//  - { done: true, totalSessions } -> piano assegnato ma finito (o non configurato)
//  - { id, name, restBetweenBlocks, blocks } -> la sessione da eseguire
export async function getCurrentSession(profile) {
  if (!profile?.assigned_plan_id) return null;

  const { data: plan, error: planError } = await supabase.from("plans").select("*").eq("id", profile.assigned_plan_id).maybeSingle();
  if (planError) throw planError;
  if (!plan) return null;

  const warmupIds = plan.warmup_block_ids || [];
  const [strengthRes, circuitRes, warmupRes] = await Promise.all([
    plan.strength_program_id
      ? supabase.from("strength_programs").select("sessions").eq("id", plan.strength_program_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    plan.circuit_program_id
      ? supabase.from("circuit_programs").select("sessions").eq("id", plan.circuit_program_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    warmupIds.length
      ? supabase.from("warmup_blocks").select("*").in("id", warmupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (strengthRes.error) throw strengthRes.error;
  if (circuitRes.error) throw circuitRes.error;
  if (warmupRes.error) throw warmupRes.error;

  const strengthSessions = strengthRes.data?.sessions || [];
  const circuitSessions = circuitRes.data?.sessions || [];
  const totalSessions = Math.min(strengthSessions.length, circuitSessions.length);
  const i = profile.current_session_position || 0;

  if (totalSessions === 0 || i >= totalSessions) {
    return { done: true, totalSessions };
  }

  const warmupById = new Map((warmupRes.data || []).map((w) => [w.id, w]));
  const orderedWarmups = warmupIds.map((id) => warmupById.get(id)).filter(Boolean);
  const warmup = orderedWarmups.length ? orderedWarmups[i % orderedWarmups.length] : null;

  const blocks = [];
  if (warmup) blocks.push({ id: `warmup-${i}`, type: "standard", exercises: warmup.exercises, rounds: warmup.rounds });
  blocks.push({ id: `strength-${i}`, type: "strength", ...strengthSessions[i] });
  circuitSessionToBlocks(circuitSessions[i]).forEach((b, bj) => blocks.push({ id: `circuit-${i}-${bj}`, type: "standard", ...b }));

  return {
    id: `${plan.id}:${i}`,
    name: `${plan.name} — Sessione ${i + 1}/${totalSessions}`,
    restBetweenBlocks: plan.rest_between_blocks,
    blocks,
  };
}

// avanza SOLO il puntatore di sessione dell'atleta loggato (RPC, vedi schema)
export async function completeCurrentSession() {
  const { error } = await supabase.rpc("complete_current_session");
  if (error) throw error;
}
