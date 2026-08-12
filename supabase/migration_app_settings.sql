-- More Muscle — impostazioni globali dell'app (testo istruzioni + numero
-- WhatsApp) modificabili dall'admin, mostrate nella pagina iniziale atleta.
-- Esegui questo script UNA VOLTA nel SQL Editor di Supabase, DOPO
-- migration_warmup_programs.sql.

-- riga singola (id fisso a 1): non serve altro che leggerla/aggiornarla,
-- niente join con profiles/owner_id — non è per-atleta, è globale.
create table public.app_settings (
  id int primary key default 1,
  instructions_text text not null default 'Premi "Vai agli allenamenti" per vedere cosa devi fare oggi. Riscaldamento, Forza e Circuito avanzano da soli, uno alla volta, man mano che li completi.',
  whatsapp_number text not null default '',
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);
alter table public.app_settings enable row level security;

-- tutti gli utenti autenticati (admin e atleti) leggono le impostazioni:
-- servono nella pagina iniziale che ogni atleta vede dopo il login
create policy "app_settings_select_authenticated" on public.app_settings
  for select using (auth.uid() is not null);

-- solo l'admin le crea/modifica
create policy "app_settings_admin_write" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.app_settings (id, whatsapp_number)
values (1, '+393793752391')
on conflict (id) do nothing;
