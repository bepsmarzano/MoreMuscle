-- More Muscle — scelta tra 3 sessioni (Forza e Circuito, non Riscaldamento)
-- al posto di un unico "prossimo" fisso, con possibilità di scartarne una
-- (torna in fondo alla coda, non sparisce — utile se interferisce con altre
-- discipline/eventi) e di far partire un atleta da una sessione specifica
-- (utile per chi arriva a metà ciclo da un altro progetto).
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO
-- migration_weight_kg.sql.

-- ---------------------------------------------------------------------------
-- 1) colonne: la coda è l'ordine PERSONALE delle sessioni ancora da fare
-- (indici dentro sessions[] del programma assegnato); batch_size = quante
-- delle prime della coda sono "in gioco" adesso (0-3) — finché non sono
-- tutte risolte (fatte o scartate) non ne compaiono altre.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists strength_queue int[] not null default '{}',
  add column if not exists strength_batch_size int not null default 0,
  add column if not exists circuit_queue int[] not null default '{}',
  add column if not exists circuit_batch_size int not null default 0;

-- ---------------------------------------------------------------------------
-- 2) backfill: chi ha già un programma assegnato oggi non riparte da zero —
-- la coda si ricostruisce dalla posizione attuale in poi.
-- ---------------------------------------------------------------------------
update public.profiles p
set strength_queue = array(select generate_series(p.strength_position, v_len - 1)),
    strength_batch_size = least(3, greatest(v_len - p.strength_position, 0))
from (select id, jsonb_array_length(sessions) as v_len from public.strength_programs) sp
where p.assigned_strength_program_id = sp.id;

update public.profiles p
set circuit_queue = array(select generate_series(p.circuit_position, v_len - 1)),
    circuit_batch_size = least(3, greatest(v_len - p.circuit_position, 0))
from (select id, jsonb_array_length(sessions) as v_len from public.circuit_programs) cp
where p.assigned_circuit_program_id = cp.id;

-- ---------------------------------------------------------------------------
-- 3) assegnazione (admin): p_start_session opzionale, 1-indicizzato come
-- mostrato in UI ("Sessione N") — di default 1 (si parte dall'inizio).
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_strength_program(p_athlete_id uuid, p_program_id uuid, p_start_session int default 1)
returns void language plpgsql security definer set search_path = public as $$
declare v_len int; v_start int;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_program_id is null then
    update public.profiles set assigned_strength_program_id = null, strength_position = 0, strength_queue = '{}', strength_batch_size = 0 where id = p_athlete_id;
    return;
  end if;
  select jsonb_array_length(sessions) into v_len from public.strength_programs where id = p_program_id;
  v_start := greatest(0, least(coalesce(p_start_session, 1) - 1, greatest(v_len - 1, 0)));
  update public.profiles set
    assigned_strength_program_id = p_program_id,
    strength_position = v_start,
    strength_queue = array(select generate_series(v_start, v_len - 1)),
    strength_batch_size = least(3, greatest(v_len - v_start, 0))
  where id = p_athlete_id;
end;
$$;
revoke all on function public.admin_assign_strength_program(uuid, uuid, int) from public;
grant execute on function public.admin_assign_strength_program(uuid, uuid, int) to authenticated;

create or replace function public.admin_assign_circuit_program(p_athlete_id uuid, p_program_id uuid, p_start_session int default 1)
returns void language plpgsql security definer set search_path = public as $$
declare v_len int; v_start int;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_program_id is null then
    update public.profiles set assigned_circuit_program_id = null, circuit_position = 0, circuit_queue = '{}', circuit_batch_size = 0 where id = p_athlete_id;
    return;
  end if;
  select jsonb_array_length(sessions) into v_len from public.circuit_programs where id = p_program_id;
  v_start := greatest(0, least(coalesce(p_start_session, 1) - 1, greatest(v_len - 1, 0)));
  update public.profiles set
    assigned_circuit_program_id = p_program_id,
    circuit_position = v_start,
    circuit_queue = array(select generate_series(v_start, v_len - 1)),
    circuit_batch_size = least(3, greatest(v_len - v_start, 0))
  where id = p_athlete_id;
end;
$$;
revoke all on function public.admin_assign_circuit_program(uuid, uuid, int) from public;
grant execute on function public.admin_assign_circuit_program(uuid, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) risoluzione (atleta, sul proprio profilo): p_index è l'indice sessione
-- (come nella coda), deve essere tra le prime batch_size della coda attuale.
-- Fatta -> rimossa per sempre. Scartata -> rimessa in fondo alla coda.
-- Quando il gruppo si esaurisce (batch_size arriva a 0) se ne apre uno nuovo
-- dalla coda residua (che può includere sessioni scartate tornate in fondo).
-- ---------------------------------------------------------------------------
create or replace function public.resolve_strength_session(p_index int, p_discard boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_queue int[]; v_batch int; v_pos int;
begin
  select strength_queue, strength_batch_size into v_queue, v_batch from public.profiles where id = auth.uid();
  if v_queue is null or v_batch is null or v_batch = 0 then raise exception 'nessuna sessione da risolvere'; end if;
  v_pos := array_position(v_queue[1:v_batch], p_index);
  if v_pos is null then raise exception 'sessione non nel gruppo attuale'; end if;
  v_queue := array_remove(v_queue, p_index);
  if p_discard then v_queue := v_queue || p_index; end if;
  v_batch := v_batch - 1;
  if v_batch = 0 then v_batch := least(3, coalesce(array_length(v_queue, 1), 0)); end if;
  update public.profiles set
    strength_queue = v_queue,
    strength_batch_size = v_batch,
    strength_position = coalesce(v_queue[1], strength_position)
  where id = auth.uid();
end;
$$;
revoke all on function public.resolve_strength_session(int, boolean) from public;
grant execute on function public.resolve_strength_session(int, boolean) to authenticated;

create or replace function public.resolve_circuit_session(p_index int, p_discard boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_queue int[]; v_batch int; v_pos int;
begin
  select circuit_queue, circuit_batch_size into v_queue, v_batch from public.profiles where id = auth.uid();
  if v_queue is null or v_batch is null or v_batch = 0 then raise exception 'nessuna sessione da risolvere'; end if;
  v_pos := array_position(v_queue[1:v_batch], p_index);
  if v_pos is null then raise exception 'sessione non nel gruppo attuale'; end if;
  v_queue := array_remove(v_queue, p_index);
  if p_discard then v_queue := v_queue || p_index; end if;
  v_batch := v_batch - 1;
  if v_batch = 0 then v_batch := least(3, coalesce(array_length(v_queue, 1), 0)); end if;
  update public.profiles set
    circuit_queue = v_queue,
    circuit_batch_size = v_batch,
    circuit_position = coalesce(v_queue[1], circuit_position)
  where id = auth.uid();
end;
$$;
revoke all on function public.resolve_circuit_session(int, boolean) from public;
grant execute on function public.resolve_circuit_session(int, boolean) to authenticated;

-- vecchie RPC complete_strength_session/complete_circuit_session non sono
-- più usate dall'app (sostituite da resolve_*), ma le lascio: non fanno
-- danno rimanendo inutilizzate e togliersele di mezzo non è necessario.
