-- More Muscle — Riscaldamento/Forza/Circuito come 3 percorsi indipendenti
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO schema.sql,
-- migration_strength_plans.sql e migration_program_composition.sql.
--
-- Ritira il concetto di "Piano": ogni atleta ora ha 3 assegnazioni e 3
-- posizioni indipendenti (Riscaldamento in rotazione infinita, Forza e
-- Circuito che avanzano e si fermano all'ultima sessione).

-- ---------------------------------------------------------------------------
-- 1) nuove colonne su profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column assigned_warmup_ids uuid[] not null default '{}',
  add column warmup_position int not null default 0,
  add column assigned_strength_program_id uuid references public.strength_programs(id) on delete set null,
  add column strength_position int not null default 0,
  add column assigned_circuit_program_id uuid references public.circuit_programs(id) on delete set null,
  add column circuit_position int not null default 0;

-- ---------------------------------------------------------------------------
-- 2) migra le assegnazioni piano esistenti (se presenti) prima di ritirare
-- tutto il resto — non c'è modo pulito di derivare 3 posizioni indipendenti
-- da 1 condivisa, quindi le posizioni ripartono da 0.
-- ---------------------------------------------------------------------------
update public.profiles p
set assigned_warmup_ids = coalesce(pl.warmup_block_ids, '{}'),
    assigned_strength_program_id = pl.strength_program_id,
    assigned_circuit_program_id = pl.circuit_program_id
from public.plans pl
where p.assigned_plan_id = pl.id;

-- ---------------------------------------------------------------------------
-- 3) ritiro di Piani — ordine: prima le policy/colonne che dipendono da
-- 'plans' o da 'plan_sessions', poi le tabelle stesse (stesso tipo di errore
-- di dipendenza già visto altre volte in questo progetto, stavolta evitato
-- pianificando l'ordine da subito).
-- ---------------------------------------------------------------------------
drop policy if exists "workouts_athlete_select_assigned" on public.workouts;

-- plan_sessions potrebbe essere già stata eliminata da una migration
-- precedente: "drop policy ... on public.plan_sessions" richiede che la
-- tabella esista comunque (l'IF EXISTS protegge solo il nome della policy),
-- quindi la eseguiamo solo se la tabella è ancora presente.
do $$
begin
  if to_regclass('public.plan_sessions') is not null then
    execute 'drop policy if exists "plan_sessions_athlete_select" on public.plan_sessions';
  end if;
end $$;
drop table if exists public.plan_sessions;

-- queste 3 policy (create da migration_program_composition.sql) referenziano
-- profiles.assigned_plan_id in un join con plans: vanno eliminate PRIMA di
-- droppare quella colonna, altrimenti Postgres si rifiuta (stesso errore di
-- dipendenza già visto altre volte). Le ricreiamo più sotto puntando alle
-- nuove colonne indipendenti.
drop policy if exists "warmup_blocks_athlete_select" on public.warmup_blocks;
drop policy if exists "strength_programs_athlete_select" on public.strength_programs;
drop policy if exists "circuit_programs_athlete_select" on public.circuit_programs;

alter table public.exercise_logs drop column if exists plan_id;
alter table public.exercise_logs drop column if exists session_position;

drop function if exists public.admin_assign_plan(uuid, uuid);
drop function if exists public.complete_current_session();

alter table public.profiles drop constraint if exists profiles_assigned_workout_fkey;
alter table public.profiles drop column if exists assigned_workout_id;
alter table public.profiles drop column if exists assigned_plan_id;
alter table public.profiles drop column if exists current_session_position;

drop table if exists public.plans;

-- ---------------------------------------------------------------------------
-- 4) le policy "athlete_select" di warmup_blocks/strength_programs/
-- circuit_programs puntavano a 'plans' (già eliminate sopra): si ricreano
-- puntando direttamente alle nuove colonne di profiles.
-- ---------------------------------------------------------------------------
create policy "warmup_blocks_athlete_select" on public.warmup_blocks
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and warmup_blocks.id = any(p.assigned_warmup_ids)
  ));

create policy "strength_programs_athlete_select" on public.strength_programs
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.assigned_strength_program_id = strength_programs.id
  ));

create policy "circuit_programs_athlete_select" on public.circuit_programs
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.assigned_circuit_program_id = circuit_programs.id
  ));

-- ---------------------------------------------------------------------------
-- 5) RPC di assegnazione (admin) — stesso pattern SECURITY DEFINER + is_admin()
-- di admin_assign_plan, una per sezione.
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_warmups(p_athlete_id uuid, p_warmup_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set assigned_warmup_ids = p_warmup_ids, warmup_position = 0 where id = p_athlete_id;
end;
$$;
revoke all on function public.admin_assign_warmups(uuid, uuid[]) from public;
grant execute on function public.admin_assign_warmups(uuid, uuid[]) to authenticated;

create or replace function public.admin_assign_strength_program(p_athlete_id uuid, p_program_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set assigned_strength_program_id = p_program_id, strength_position = 0 where id = p_athlete_id;
end;
$$;
revoke all on function public.admin_assign_strength_program(uuid, uuid) from public;
grant execute on function public.admin_assign_strength_program(uuid, uuid) to authenticated;

create or replace function public.admin_assign_circuit_program(p_athlete_id uuid, p_program_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set assigned_circuit_program_id = p_program_id, circuit_position = 0 where id = p_athlete_id;
end;
$$;
revoke all on function public.admin_assign_circuit_program(uuid, uuid) from public;
grant execute on function public.admin_assign_circuit_program(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) RPC di completamento (atleta, sul proprio profilo). Il riscaldamento
-- ruota all'infinito (modulo la lunghezza della rotazione assegnata); Forza e
-- Circuito avanzano e si fermano all'ultima sessione del programma. "Salta"
-- sul Circuito non ha bisogno di nessuna RPC: non completare = ritrovare la
-- stessa sessione al giro dopo, comportamento già gratis.
-- ---------------------------------------------------------------------------
create or replace function public.complete_warmup()
returns void language plpgsql security definer set search_path = public as $$
declare v_len int;
begin
  select array_length(assigned_warmup_ids, 1) into v_len from public.profiles where id = auth.uid();
  if v_len is null or v_len = 0 then return; end if;
  update public.profiles set warmup_position = (warmup_position + 1) % v_len where id = auth.uid();
end;
$$;
revoke all on function public.complete_warmup() from public;
grant execute on function public.complete_warmup() to authenticated;

create or replace function public.complete_strength_session()
returns void language plpgsql security definer set search_path = public as $$
declare v_len int;
begin
  select jsonb_array_length(sessions) into v_len from public.strength_programs
    where id = (select assigned_strength_program_id from public.profiles where id = auth.uid());
  if v_len is null then return; end if;
  update public.profiles
    set strength_position = least(strength_position + 1, greatest(v_len - 1, 0))
    where id = auth.uid();
end;
$$;
revoke all on function public.complete_strength_session() from public;
grant execute on function public.complete_strength_session() to authenticated;

create or replace function public.complete_circuit_session()
returns void language plpgsql security definer set search_path = public as $$
declare v_len int;
begin
  select jsonb_array_length(sessions) into v_len from public.circuit_programs
    where id = (select assigned_circuit_program_id from public.profiles where id = auth.uid());
  if v_len is null then return; end if;
  update public.profiles
    set circuit_position = least(circuit_position + 1, greatest(v_len - 1, 0))
    where id = auth.uid();
end;
$$;
revoke all on function public.complete_circuit_session() from public;
grant execute on function public.complete_circuit_session() to authenticated;
