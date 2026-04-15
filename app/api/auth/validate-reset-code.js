// API endpoint: /api/auth/validate-reset-code
import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/SupabaseClient';

export async function POST(req) {
  const { email, code, newPassword } = await req.json();
  if (!email || !code || !newPassword) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
  }

  // Aquí deberías validar el código contra la base de datos y su expiración
  // Si es válido, cambiar la contraseña del usuario
  // Ejemplo:
  // 1. Buscar código en tabla password_resets
  // 2. Si coincide y no está expirado, cambiar contraseña en Supabase
  // 3. Eliminar el código usado

  // Buscar el código en la tabla y validar expiración
  const { data: reset, error } = await supabase
    .from('password_resets')
    .select('*')
    .eq('email', email)
    .eq('code', code)
    .single();

  if (error || !reset) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
  }
  if (new Date(reset.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Código expirado' }, { status: 400 });
  }

  // Cambiar contraseña en Supabase
  const { error: updateError } = await supabase.auth.admin.updateUserByEmail(email, { password: newPassword });
  if (updateError) {
    return NextResponse.json({ error: 'No se pudo cambiar la contraseña' }, { status: 500 });
  }

  // Eliminar el código usado
  await supabase
    .from('password_resets')
    .delete()
    .eq('email', email)
    .eq('code', code);

  return NextResponse.json({ success: true });
}
