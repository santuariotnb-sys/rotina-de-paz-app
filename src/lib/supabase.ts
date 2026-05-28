import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anon) return null;
  if (!_client) {
    _client = createClient(url, anon, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

export const supabaseEnabled = Boolean(url && anon);
