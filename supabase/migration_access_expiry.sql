-- More Muscle — scadenza opzionale dell'accesso per atleta (clienti che
-- acquistano un mese o un periodo di prova, su un programma che dura più
-- mesi). Blocco solo lato app (non RLS): la policy "profiles_update_admin_only"
-- già esistente in schema.sql copre già la scrittura di questa colonna da
-- parte dell'admin, nessuna nuova policy/RPC necessaria.
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO
-- migration_random_warmup.sql.

alter table public.profiles add column if not exists access_until date;
-- null = nessuna scadenza (comportamento di sempre, per la maggior parte degli atleti)
