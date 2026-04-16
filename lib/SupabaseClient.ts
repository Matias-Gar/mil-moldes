import { createClient } from '@supabase/supabase-js';

// Configuración de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Crear cliente de Supabase (sesión persistente)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// (Eliminado: supabasePublic. Usar recreación dinámica en el flujo de pedidos anónimos)

// Debug en consola
// console.log('🔗 Supabase conectado a:', supabaseUrl);
