import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined');
  if (!supabaseAnonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined');
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
