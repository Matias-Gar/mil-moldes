import { createClient } from '@supabase/supabase-js';


// Configuración de Supabase usando SOLO variables de entorno
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('❌ Error: Variables de entorno de Supabase no configuradas. Revisa tu .env y reinicia el servidor.');
}

// Verificar que las variables estén configuradas
// if (!supabaseUrl || !supabaseAnonKey) {
//   console.error('❌ Error: Variables de entorno de Supabase no configuradas');
// }

// Crear cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Debug en consola
// console.log('🔗 Supabase conectado a:', supabaseUrl);
