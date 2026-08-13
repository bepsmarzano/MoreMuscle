-- More Muscle — bucket Supabase Storage per le GIF esercizio, al posto degli
-- hotlink a Google Drive/Photos (lenti e non affidabili per l'incorporamento).
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO
-- migration_app_settings.sql. Dopo averlo eseguito, lancia lo script Node
-- scripts/migrate-gifs-to-storage.mjs (vedi README) per spostarci dentro le
-- GIF esistenti.

insert into storage.buckets (id, name, public)
values ('exercise-gifs', 'exercise-gifs', true)
on conflict (id) do nothing;

-- bucket "public": leggibile da chiunque abbia l'URL (stesso comportamento
-- di un link Google Drive pubblico, ma servito dal nostro storage). La
-- policy sotto è comunque esplicita per sicurezza, anche se Supabase serve
-- già i bucket pubblici senza passare da qui.
drop policy if exists "exercise_gifs_public_read" on storage.objects;
create policy "exercise_gifs_public_read" on storage.objects
  for select using (bucket_id = 'exercise-gifs');

-- scrittura/eliminazione solo admin (lo script di migrazione usa comunque
-- la service role key, che bypassa RLS — queste policy servono per un
-- eventuale caricamento futuro fatto dall'app stessa, non ancora presente)
drop policy if exists "exercise_gifs_admin_write" on storage.objects;
create policy "exercise_gifs_admin_write" on storage.objects
  for insert with check (bucket_id = 'exercise-gifs' and public.is_admin());

drop policy if exists "exercise_gifs_admin_update" on storage.objects;
create policy "exercise_gifs_admin_update" on storage.objects
  for update using (bucket_id = 'exercise-gifs' and public.is_admin());

drop policy if exists "exercise_gifs_admin_delete" on storage.objects;
create policy "exercise_gifs_admin_delete" on storage.objects
  for delete using (bucket_id = 'exercise-gifs' and public.is_admin());
