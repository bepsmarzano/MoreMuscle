import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// true solo se .env.local ha davvero URL+anon key (vedi .env.local.example).
// Usato da App.jsx per mostrare una schermata di setup invece di un crash
// bianco: supabase-js lancia un errore sincrono se url/key sono vuoti.
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey)
  : createClient("https://placeholder.supabase.co", "placeholder-anon-key");
