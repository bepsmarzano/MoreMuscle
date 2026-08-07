-- More Muscle — schema multi-utente (admin + atleti)
-- Esegui questo script UNA VOLTA nel SQL Editor del tuo progetto Supabase
-- (Dashboard -> SQL Editor -> New query -> incolla tutto -> Run).
-- Dopo averlo eseguito, promuovi te stesso ad admin con la query in fondo al file.

-- ---------------------------------------------------------------------------
-- profiles: una riga per ogni utente Supabase auth (admin o atleta)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'athlete' check (role in ('admin','athlete')),
  assigned_workout_id uuid, -- foreign key aggiunta più sotto, dopo che 'workouts' esiste
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- helper SECURITY DEFINER: evita la recursione RLS quando una policy deve
-- chiedersi "l'utente corrente è admin?" leggendo la stessa tabella profiles.
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- update SOLO admin: l'atleta non deve poter cambiare da solo il proprio ruolo
-- o l'allenamento assegnato (quello passa solo dalla funzione admin_assign_workout).
create policy "profiles_update_admin_only" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- trigger: crea automaticamente il profilo quando Supabase crea l'utente auth
-- (succede sia per il primo admin che si registra, sia per ogni atleta invitato).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- library: la libreria esercizi dell'admin, UNA riga con tutto l'array in JSONB
-- (stessa forma già usata oggi in localStorage — mm_library). Nessun atleta la
-- legge mai direttamente: i workout salvano già nome/gif/rep/tempo "snapshot"
-- per ogni esercizio (come fa oggi fromLib() nel client).
-- ---------------------------------------------------------------------------
create table public.library (
  owner_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  exercises jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.library enable row level security;
create policy "library_admin_all" on public.library
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- workouts: UNA riga per allenamento (deve restare granulare — un atleta deve
-- poter leggere SOLO l'allenamento assegnato a lui, non l'intera collezione).
-- ---------------------------------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  rest_between_blocks int not null default 120,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workouts enable row level security;

create policy "workouts_admin_all" on public.workouts
  for all using (public.is_admin()) with check (public.is_admin());

create policy "workouts_athlete_select_assigned" on public.workouts
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.assigned_workout_id = workouts.id
  ));

-- ora che 'workouts' esiste, aggiungo la foreign key su profiles
alter table public.profiles
  add constraint profiles_assigned_workout_fkey
  foreign key (assigned_workout_id) references public.workouts(id) on delete set null;

-- RPC: unico modo per assegnare un allenamento a un atleta. Bypassa la policy
-- "profiles_update_admin_only" (che negherebbe l'update da un client anon key)
-- restando comunque protetta dal controllo is_admin() interno.
create or replace function public.admin_assign_workout(p_athlete_id uuid, p_workout_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.profiles set assigned_workout_id = p_workout_id where id = p_athlete_id;
end;
$$;
revoke all on function public.admin_assign_workout(uuid, uuid) from public;
grant execute on function public.admin_assign_workout(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- questionnaire_responses: risposte standard, una riga per atleta,
-- compilabile/aggiornabile dall'atleta stesso (self-service).
-- ---------------------------------------------------------------------------
create table public.questionnaire_responses (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  goal text,
  level text,
  injuries text,
  days_per_week int,
  equipment text,
  notes text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.questionnaire_responses enable row level security;

create policy "questionnaire_admin_all" on public.questionnaire_responses
  for all using (public.is_admin()) with check (public.is_admin());

create policy "questionnaire_athlete_own" on public.questionnaire_responses
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());

-- ---------------------------------------------------------------------------
-- PASSO MANUALE — esegui questa riga (con la tua vera email) DOPO aver fatto
-- il primo login nell'app come admin, per promuoverti da 'athlete' a 'admin'.
-- Non può esistere un modo automatico dalla UI per "diventare admin".
-- ---------------------------------------------------------------------------
-- update public.profiles set role = 'admin' where email = 'tua-email@esempio.com';
