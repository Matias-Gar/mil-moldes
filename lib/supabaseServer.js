import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://gzvtuenpwndodnetnmzi.supabase.co";

const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

if (!supabaseServiceKey) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Faltan variables de entorno de Supabase para el backend');
  }
}

export function getSupabaseServerClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabaseServerClientFromRequest(request) {
  const authHeader = request?.headers?.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader : "";

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: bearer ? { Authorization: bearer } : {},
    },
  });
}
