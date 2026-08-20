-- More Muscle — chili esatti opzionali accanto al livello di carico che
-- l'atleta annota a fine blocco Circuito (oltre a "Leggero/Moderato/..."
-- può scrivere anche il numero preciso di chili usati davvero).
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO
-- migration_tts_cache.sql.

alter table public.exercise_logs add column if not exists weight_kg numeric;
