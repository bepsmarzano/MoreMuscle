-- More Muscle — Riscaldamenti/Forza/Circuiti come librerie riusabili
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO schema.sql
-- e migration_strength_plans.sql.
--
-- Da qui in poi una "sessione" non è più una riga workouts: si assembla al
-- volo da tre librerie riusabili (riscaldamenti in rotazione, un programma
-- Forza, un programma Circuito), tutte referenziate da un piano.

-- ---------------------------------------------------------------------------
-- warmup_blocks: routine di riscaldamento riusabili (stessa forma di un
-- blocco standard di oggi: esercizi + round). Un piano ne referenzia un set
-- ordinato che ruota a rotazione fissa tra le sessioni.
-- ---------------------------------------------------------------------------
create table public.warmup_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  exercises jsonb not null default '[]'::jsonb,
  rounds int not null default 1,
  created_at timestamptz not null default now()
);
alter table public.warmup_blocks enable row level security;
create policy "warmup_blocks_admin_all" on public.warmup_blocks
  for all using (public.is_admin()) with check (public.is_admin());
create policy "warmup_blocks_athlete_select" on public.warmup_blocks
  for select using (exists (
    select 1 from public.profiles p join public.plans pl on pl.id = p.assigned_plan_id
    where p.id = auth.uid() and warmup_blocks.id = any(pl.warmup_block_ids)
  ));

-- ---------------------------------------------------------------------------
-- strength_programs / circuit_programs: sequenza ORDINATA di sessioni
-- riusabile (progressione), condivisibile su più piani/atleti.
-- ---------------------------------------------------------------------------
create table public.strength_programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  sessions jsonb not null default '[]'::jsonb, -- ogni elemento = shape di un blocco "strength" di oggi
  created_at timestamptz not null default now()
);
alter table public.strength_programs enable row level security;
create policy "strength_programs_admin_all" on public.strength_programs
  for all using (public.is_admin()) with check (public.is_admin());
create policy "strength_programs_athlete_select" on public.strength_programs
  for select using (exists (
    select 1 from public.profiles p join public.plans pl on pl.id = p.assigned_plan_id
    where p.id = auth.uid() and pl.strength_program_id = strength_programs.id
  ));

create table public.circuit_programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  sessions jsonb not null default '[]'::jsonb, -- ogni elemento = { exercises, rounds }
  created_at timestamptz not null default now()
);
alter table public.circuit_programs enable row level security;
create policy "circuit_programs_admin_all" on public.circuit_programs
  for all using (public.is_admin()) with check (public.is_admin());
create policy "circuit_programs_athlete_select" on public.circuit_programs
  for select using (exists (
    select 1 from public.profiles p join public.plans pl on pl.id = p.assigned_plan_id
    where p.id = auth.uid() and pl.circuit_program_id = circuit_programs.id
  ));

-- ---------------------------------------------------------------------------
-- plans: si arricchisce per comporre le tre librerie, non referenzia più
-- plan_sessions/workouts.
-- ---------------------------------------------------------------------------
alter table public.plans add column warmup_block_ids uuid[] not null default '{}'; -- ordine = ordine di rotazione
alter table public.plans add column strength_program_id uuid references public.strength_programs(id) on delete set null;
alter table public.plans add column circuit_program_id uuid references public.circuit_programs(id) on delete set null;
alter table public.plans add column rest_between_blocks int not null default 120;

-- le sessioni non sono più righe plan_sessions: non serve più la tabella
drop policy if exists "plan_sessions_athlete_select" on public.plan_sessions;
drop table if exists public.plan_sessions;

-- le sessioni non sono più righe workouts: la vecchia policy read-athlete non serve più
-- (la tabella workouts resta nel DB, solo l'admin può ancora leggerla/scriverla)
drop policy if exists "workouts_athlete_select_assigned" on public.workouts;

-- tracciabilità dei log: non c'è più un workout_id reale a cui agganciarsi
alter table public.exercise_logs add column plan_id uuid references public.plans(id) on delete set null;
alter table public.exercise_logs add column session_position int;

-- RPC aggiornata: il totale sessioni del piano è il minimo tra le lunghezze
-- (jsonb_array_length) dei due programmi assegnati, non più un count su plan_sessions.
create or replace function public.complete_current_session()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_strength_id uuid;
  v_circuit_id uuid;
  v_total int;
begin
  select pl.strength_program_id, pl.circuit_program_id into v_strength_id, v_circuit_id
  from public.profiles p join public.plans pl on pl.id = p.assigned_plan_id
  where p.id = auth.uid();

  if v_strength_id is null or v_circuit_id is null then
    return;
  end if;

  select least(
    coalesce((select jsonb_array_length(sessions) from public.strength_programs where id = v_strength_id), 0),
    coalesce((select jsonb_array_length(sessions) from public.circuit_programs where id = v_circuit_id), 0)
  ) into v_total;

  update public.profiles
    set current_session_position = least(current_session_position + 1, greatest(v_total - 1, 0))
    where id = auth.uid();
end;
$$;
