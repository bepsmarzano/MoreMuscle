-- More Muscle — Riscaldamento come "Programma" (sequenza ordinata), stessa
-- forma/UX di Forza e Circuito: un solo menu a tendina per assegnarlo.
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO
-- migration_split_sections.sql.
--
-- Prima il Riscaldamento era una rotazione ad-hoc: per ogni atleta si
-- sceglievano a mano più routine singole (warmup_blocks) e il loro ordine
-- (profiles.assigned_warmup_ids[]). Questo lo trasforma in una libreria
-- riusabile — un "Programma Riscaldamento" (warmup_programs, sessions
-- jsonb, stessa forma di strength_programs/circuit_programs) — assegnata con
-- un id solo, come già succede per Forza e Circuito. La rotazione infinita
-- (non "finisce" mai, a differenza di Forza/Circuito) resta com'era: ora
-- gira sulle sessioni del programma assegnato invece che su una lista di id.

-- ---------------------------------------------------------------------------
-- 1) nuova tabella warmup_programs — stesso pattern di strength_programs/circuit_programs
-- ---------------------------------------------------------------------------
create table public.warmup_programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null,
  sessions jsonb not null default '[]'::jsonb, -- ogni elemento = { exercises, rounds } (un blocco standard di oggi)
  created_at timestamptz not null default now()
);
alter table public.warmup_programs enable row level security;
create policy "warmup_programs_admin_all" on public.warmup_programs
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) nuova colonna di assegnazione su profiles (warmup_position esiste già,
-- si riusa: resta l'indice — a rotazione — nella sequenza sessions)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column assigned_warmup_program_id uuid references public.warmup_programs(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3) migra le rotazioni ad-hoc esistenti: per ogni atleta con una rotazione
-- non vuota, crea UN programma con le routine nell'ordine già assegnato, e
-- fallo diventare il suo programma assegnato (posizione azzerata, come nelle
-- altre migrazioni di questo progetto quando si ristruttura un'assegnazione).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_sessions jsonb;
  v_program_id uuid;
  v_owner uuid;
begin
  select id into v_owner from public.profiles where role = 'admin' order by created_at limit 1;

  for r in
    select id, full_name, email, assigned_warmup_ids
    from public.profiles
    where coalesce(array_length(assigned_warmup_ids, 1), 0) > 0
  loop
    select coalesce(jsonb_agg(jsonb_build_object('exercises', wb.exercises, 'rounds', wb.rounds) order by u.ord), '[]'::jsonb)
      into v_sessions
      from unnest(r.assigned_warmup_ids) with ordinality as u(warmup_id, ord)
      join public.warmup_blocks wb on wb.id = u.warmup_id;

    insert into public.warmup_programs (owner_id, name, sessions)
      values (coalesce(v_owner, r.id), 'Riscaldamento — ' || coalesce(r.full_name, r.email, 'atleta migrato'), v_sessions)
      returning id into v_program_id;

    update public.profiles set assigned_warmup_program_id = v_program_id, warmup_position = 0 where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) ritiro del vecchio modello — ordine: prima la policy che dipende da
-- assigned_warmup_ids, poi la colonna, poi la vecchia tabella/RPC.
-- ---------------------------------------------------------------------------
drop policy if exists "warmup_blocks_athlete_select" on public.warmup_blocks;
alter table public.profiles drop column if exists assigned_warmup_ids;
drop table if exists public.warmup_blocks;
drop function if exists public.admin_assign_warmups(uuid, uuid[]);

-- ---------------------------------------------------------------------------
-- 5) policy "athlete_select" del nuovo warmup_programs — stesso pattern di
-- strength_programs/circuit_programs.
-- ---------------------------------------------------------------------------
create policy "warmup_programs_athlete_select" on public.warmup_programs
  for select using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.assigned_warmup_program_id = warmup_programs.id
  ));

-- ---------------------------------------------------------------------------
-- 6) RPC di assegnazione (admin) — stesso pattern di admin_assign_strength_program.
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_warmup_program(p_athlete_id uuid, p_program_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  update public.profiles set assigned_warmup_program_id = p_program_id, warmup_position = 0 where id = p_athlete_id;
end;
$$;
revoke all on function public.admin_assign_warmup_program(uuid, uuid) from public;
grant execute on function public.admin_assign_warmup_program(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) RPC di completamento (atleta) — a differenza di Forza/Circuito ruota
-- all'infinito (modulo), non si ferma mai all'ultima sessione.
-- ---------------------------------------------------------------------------
create or replace function public.complete_warmup()
returns void language plpgsql security definer set search_path = public as $$
declare v_len int;
begin
  select jsonb_array_length(sessions) into v_len from public.warmup_programs
    where id = (select assigned_warmup_program_id from public.profiles where id = auth.uid());
  if v_len is null or v_len = 0 then return; end if;
  update public.profiles set warmup_position = (warmup_position + 1) % v_len where id = auth.uid();
end;
$$;
revoke all on function public.complete_warmup() from public;
grant execute on function public.complete_warmup() to authenticated;
