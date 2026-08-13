-- More Muscle — alza il limite di dimensione del bucket exercise-gifs.
-- Esegui DOPO migration_gif_storage.sql: alcune GIF superano il default
-- lasciato alla creazione del bucket e venivano rifiutate in upload durante
-- la migrazione (vedi scripts/migrate-gifs-to-storage.mjs).
update storage.buckets set file_size_limit = 104857600 where id = 'exercise-gifs'; -- 100MB
