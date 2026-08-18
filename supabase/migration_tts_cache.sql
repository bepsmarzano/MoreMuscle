-- More Muscle — bucket Supabase Storage per la cache degli annunci vocali
-- generati con ElevenLabs (al posto della sintesi vocale del browser).
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO
-- migration_athlete_profile.sql.
--
-- Ogni frase esatta viene generata una sola volta (la funzione serverless
-- api/tts.js controlla prima questo bucket, chiama ElevenLabs solo se manca)
-- e riservita per sempre dopo — stessa logica già usata per le GIF esercizio:
-- si paga/aspetta solo la prima volta che una frase esiste davvero.

insert into storage.buckets (id, name, public)
values ('tts-cache', 'tts-cache', true)
on conflict (id) do nothing;

-- bucket "public": leggibile da chiunque abbia l'URL (serve al browser per
-- riprodurre l'audio). Scrittura solo dalla funzione serverless, che usa la
-- service role key e quindi bypassa comunque RLS — nessuna policy di
-- scrittura qui, l'app non carica mai file in questo bucket direttamente.
drop policy if exists "tts_cache_public_read" on storage.objects;
create policy "tts_cache_public_read" on storage.objects
  for select using (bucket_id = 'tts-cache');
