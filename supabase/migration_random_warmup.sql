-- More Muscle — riscaldamento casuale invece che a rotazione numerata, con
-- la possibilità per l'atleta di cambiarlo (sempre pescando a caso tra gli
-- altri assegnati, mai lo stesso appena visto). Esegui questo script UNA
-- VOLTA nel SQL Editor di Supabase, DOPO migration_workout_choice.sql.

-- assegnazione (admin): posizione iniziale casuale invece che sempre 0.
create or replace function public.admin_assign_warmup_program(p_athlete_id uuid, p_program_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_len int;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  if p_program_id is null then
    update public.profiles set assigned_warmup_program_id = null, warmup_position = 0 where id = p_athlete_id;
    return;
  end if;
  select jsonb_array_length(sessions) into v_len from public.warmup_programs where id = p_program_id;
  update public.profiles set
    assigned_warmup_program_id = p_program_id,
    warmup_position = case when coalesce(v_len, 0) > 0 then floor(random() * v_len)::int else 0 end
  where id = p_athlete_id;
end;
$$;
revoke all on function public.admin_assign_warmup_program(uuid, uuid) from public;
grant execute on function public.admin_assign_warmup_program(uuid, uuid) to authenticated;

-- completamento (atleta): passa a un altro riscaldamento scelto a caso tra
-- gli assegnati (mai lo stesso appena fatto, se ce n'è più di uno).
create or replace function public.complete_warmup()
returns void language plpgsql security definer set search_path = public as $$
declare v_len int; v_cur int; v_new int;
begin
  select warmup_position into v_cur from public.profiles where id = auth.uid();
  select jsonb_array_length(sessions) into v_len from public.warmup_programs
    where id = (select assigned_warmup_program_id from public.profiles where id = auth.uid());
  if v_len is null or v_len = 0 then return; end if;
  v_new := case when v_len = 1 then 0 else (coalesce(v_cur, 0) + 1 + floor(random() * (v_len - 1))::int) % v_len end;
  update public.profiles set warmup_position = v_new where id = auth.uid();
end;
$$;
revoke all on function public.complete_warmup() from public;
grant execute on function public.complete_warmup() to authenticated;

-- "cambia riscaldamento" (atleta): stessa logica di complete_warmup ma senza
-- che l'atleta lo abbia davvero fatto — semplicemente non gli piace quello
-- proposto e ne vuole un altro a caso.
create or replace function public.reroll_warmup()
returns void language plpgsql security definer set search_path = public as $$
declare v_len int; v_cur int; v_new int;
begin
  select jsonb_array_length(sessions), p.warmup_position into v_len, v_cur from public.warmup_programs
    join public.profiles p on p.assigned_warmup_program_id = warmup_programs.id
    where p.id = auth.uid();
  if v_len is null or v_len = 0 then return; end if;
  v_new := case when v_len = 1 then 0 else (coalesce(v_cur, 0) + 1 + floor(random() * (v_len - 1))::int) % v_len end;
  update public.profiles set warmup_position = v_new where id = auth.uid();
end;
$$;
revoke all on function public.reroll_warmup() from public;
grant execute on function public.reroll_warmup() to authenticated;
