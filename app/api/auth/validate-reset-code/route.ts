"use server";
import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/SupabaseClient';

export async function POST(req: Request) {
  const { email, code, nueva_contrasena } = await req.json();
  if (!email || !code || !nueva_contrasena) {
    return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
  }
  const emailNorm = email.trim().toLowerCase();
  // Buscar el código en la tabla
  const { data: reset, error } = await supabase
    .from('password_resets')
    .select('code, expires_at')
    .eq('email', emailNorm)
    .eq('code', code)
    .single();
  if (error || !reset) {
    return NextResponse.json({ error: 'Código inválido' }, { status: 401 });
  }
  if (new Date(reset.expires_at) < new Date()) {
    return NextResponse.json({ error: 'El código ha expirado' }, { status: 401 });
  }
  // Buscar el usuario por email para obtener su id
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
  if (userError || !userData || !userData.users || userData.users.length === 0) {
    return NextResponse.json({ error: 'No se pudo encontrar el usuario para cambiar la contraseña', details: userError }, { status: 500 });
  }
  const user = userData.users.find((u: any) => u.email && u.email.toLowerCase() === emailNorm);
  if (!user) {
    return NextResponse.json({ error: 'No se pudo encontrar el usuario para cambiar la contraseña', details: 'Usuario no encontrado' }, { status: 500 });
  }
  const userId = user.id;
  // Cambiar la contraseña real en Supabase Auth
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password: nueva_contrasena });
  if (updateError) {
    return NextResponse.json({ error: 'No se pudo cambiar la contraseña', details: updateError }, { status: 500 });
  }
  // Eliminar el código usado
  await supabase.from('password_resets').delete().eq('email', emailNorm);
  return NextResponse.json({ success: true, message: 'Contraseña cambiada correctamente' });
}
