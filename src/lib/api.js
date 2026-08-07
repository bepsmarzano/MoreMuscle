import { supabase } from "./supabaseClient";

// Id "vero" per le righe workouts.id (colonna uuid in Postgres). Gli id interni
// a blocks/exercises restano quelli generati da uid() in shared/ui.jsx: vivono
// dentro una colonna JSONB, senza vincoli di formato.
export function newWorkoutId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

// ---- allenamenti (admin) -----------------------------------------------------
function rowToWorkout(row) {
  return { id: row.id, name: row.name, restBetweenBlocks: row.rest_between_blocks, blocks: row.blocks || [] };
}

export async function listWorkouts() {
  const { data, error } = await supabase.from("workouts").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data.map(rowToWorkout);
}

export async function saveWorkout(workout) {
  const uid = await currentUserId();
  const row = {
    id: workout.id,
    owner_id: uid,
    name: workout.name,
    rest_between_blocks: workout.restBetweenBlocks,
    blocks: workout.blocks,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("workouts").upsert(row).select().single();
  if (error) throw error;
  return rowToWorkout(data);
}

export async function deleteWorkout(id) {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}

// ---- atleti (admin) -----------------------------------------------------------
// join via la relazione questionnaire_responses.athlete_id -> profiles.id
export async function listAthletes() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, assigned_workout_id, created_at, questionnaire_responses(goal, level, injuries, days_per_week, equipment, notes, updated_at)")
    .eq("role", "athlete")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((p) => ({ ...p, questionnaire: p.questionnaire_responses?.[0] || p.questionnaire_responses || null }));
}

export async function assignWorkout(athleteId, workoutId) {
  const { error } = await supabase.rpc("admin_assign_workout", { p_athlete_id: athleteId, p_workout_id: workoutId });
  if (error) throw error;
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

// ---- allenamento assegnato (atleta) ---------------------------------------------
export async function getAssignedWorkout(workoutId) {
  if (!workoutId) return null;
  const { data, error } = await supabase.from("workouts").select("*").eq("id", workoutId).maybeSingle();
  if (error) throw error;
  return data ? rowToWorkout(data) : null;
}
