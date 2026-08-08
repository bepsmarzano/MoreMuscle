-- More Muscle — blocco Forza + Piani multi-sessione con progressione
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO schema.sql.

-- ---------------------------------------------------------------------------
-- athlete_maxes: massimale (kg) per atleta+esercizio, gestito dall'admin.
-- Usato per calcolare automaticamente il peso di lavoro nel blocco Forza
-- (workSets[].percent * max_kg / 100). L'atleta lo vede ma non lo modifica
-- (lo re-imposti tu dopo un retest).
-- ---------------------------------------------------------------------------
create table public.athlete_maxes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  lift_key text not null,
  max_kg numeric not null,
  updated_at timestamptz not null default now(),
  unique (athlete_id, lift_key)
);
alter table public.athlete_maxes enable row level security;

create policy "athlete_maxes_admin_all" on public.athlete_maxes
  for all using (public.is_admin()) with check (public.is_admin());
create policy "athlete_maxes_athlete_select_own" on public.athlete_maxes
  for select using (athlete_id = auth.uid());

-- ---------------------------------------------------------------------------
-- exercise_logs: quello che l'atleta annota durante l'allenamento.
--  - reps: quante ripetizioni ha fatto in una serie AMRAP della Forza
--          (workSets[].amrap = true, dove il peso è calcolato ma le rep no).
--  - load_label: che livello di carico ha usato in un esercizio del Circuito
--          con attrezzo (manubri/kettlebell) — "molto leggero".."molto pesante".
-- Mai entrambi insieme: ogni riga è o l'uno o l'altro, dipende dal contesto.
-- ---------------------------------------------------------------------------
create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  exercise_name text not null,
  reps int,
  load_label text,
  logged_at timestamptz not null default now()
);
alter table public.exercise_logs enable row level security;

create policy "exercise_logs_admin_all" on public.exercise_logs
  for all using (public.is_admin()) with check (public.is_admin());
create policy "exercise_logs_athlete_own" on public.exercise_logs
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

-- ---------------------------------------------------------------------------
-- plans / plan_sessions: un piano è semplicemente un ORDINE di workouts già
-- esistenti — ogni sessione resta un workout con i suoi 3 blocchi, editor e
-- player restano gli stessi. Le sessioni progressive (settimana per
-- settimana, con percentuali diverse) sono workout distinti nell'ordine
-- giusto, costruiti a mano (es. duplicando la sessione precedente).
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.plans enable row level security;
create policy "plans_admin_all" on public.plans
  for all using (public.is_admin()) with check (public.is_admin());

create table public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  position int not null,
  workout_id uuid not null references public.workouts(id) on delete cascade,
  unique (plan_id, position)
);
alter table public.plan_sessions enable row level security;
create policy "plan_sessions_admin_all" on public.plan_sessions
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- profiles: sostituisco l'assegnazione di UN workout con l'assegnazione di UN
-- piano + un puntatore alla sessione corrente.
-- ---------------------------------------------------------------------------
-- la vecchia policy (da schema.sql) dipende da assigned_workout_id: va
-- eliminata PRIMA di poter droppare la colonna, altrimenti Postgres si rifiuta.
drop policy if exists "workouts_athlete_select_assigned" on public.workouts;

alter table public.profiles drop constraint if exists profiles_assigned_workout_fkey;
alter table public.profiles drop column if exists assigned_workout_id;
alter table public.profiles add column assigned_plan_id uuid references public.plans(id) on delete set null;
alter table public.profiles add column current_session_position int not null default 0;

-- l'atleta può leggere plan_sessions/workouts SOLO del piano assegnato a lui
create policy "plan_sessions_athlete_select" on public.plan_sessions
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.assigned_plan_id = plan_sessions.plan_id
  ));

create policy "workouts_athlete_select_assigned" on public.workouts
  for select using (exists (
    select 1 from public.plan_sessions ps
    join public.profiles p on p.assigned_plan_id = ps.plan_id
    where p.id = auth.uid() and ps.workout_id = workouts.id
  ));

-- RPC: sostituisce admin_assign_workout. Assegna un piano e riparte dalla
-- prima sessione.
drop function if exists public.admin_assign_workout(uuid, uuid);
create or replace function public.admin_assign_plan(p_athlete_id uuid, p_plan_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.profiles
    set assigned_plan_id = p_plan_id, current_session_position = 0
    where id = p_athlete_id;
end;
$$;
revoke all on function public.admin_assign_plan(uuid, uuid) from public;
grant execute on function public.admin_assign_plan(uuid, uuid) to authenticated;

-- RPC: l'atleta avanza SOLO il proprio puntatore di sessione (capped alla
-- lunghezza del piano) — niente permesso generico di update su profiles.
create or replace function public.complete_current_session()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_plan_id uuid;
  v_total int;
begin
  select assigned_plan_id into v_plan_id from public.profiles where id = auth.uid();
  if v_plan_id is null then
    return;
  end if;
  select count(*) into v_total from public.plan_sessions where plan_id = v_plan_id;
  update public.profiles
    set current_session_position = least(current_session_position + 1, greatest(v_total - 1, 0))
    where id = auth.uid();
end;
$$;
revoke all on function public.complete_current_session() from public;
grant execute on function public.complete_current_session() to authenticated;
