import { createClient } from '@supabase/supabase-js';
import { getCarritoToken } from './carritoToken';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno de Supabase. Revisa .env.local y reinicia el servidor.');
}

const carritoToken = getCarritoToken();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: carritoToken ? { 'carrito-token': carritoToken } : {},
  },
});
