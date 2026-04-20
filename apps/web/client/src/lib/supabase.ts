import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set — auth disabled");
    return null;
  }
  _supabase = createClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
}
