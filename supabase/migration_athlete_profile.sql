-- More Muscle — profilo atleta self-service: nome e massimali, inseriti
-- dall'atleta stesso invece che solo dall'admin. I massimali restano usati
-- per calcolare in automatico il peso di lavoro nel blocco Forza (percentuale
-- * massimale) — ora l'atleta può inserirli lui senza passare dall'admin.
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO
-- migration_gif_size_limit.sql.

-- ---------------------------------------------------------------------------
-- 1) nome: niente accesso diretto in scrittura a tutta la riga profiles
-- (conterrebbe anche role/assegnazioni, che l'atleta non deve poter toccare)
-- — solo una RPC stretta che aggiorna esclusivamente full_name, sul proprio profilo.
-- ---------------------------------------------------------------------------
create or replace function public.update_my_name(p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set full_name = nullif(trim(p_full_name), '') where id = auth.uid();
end;
$$;
revoke all on function public.update_my_name(text) from public;
grant execute on function public.update_my_name(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) massimali: prima l'atleta poteva solo leggere i propri (scritti
-- dall'admin); ora può anche scriverli/aggiornarli lui — stesso pattern
-- "self-service sulla propria riga" già usato per questionnaire_responses.
-- ---------------------------------------------------------------------------
drop policy if exists "athlete_maxes_athlete_select_own" on public.athlete_maxes;
create policy "athlete_maxes_athlete_own" on public.athlete_maxes
  for all using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
