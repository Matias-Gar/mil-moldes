"use server";
import { NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '../../../../lib/SupabaseAdminClient';

function generarCodigo(longitud = 6) {
  return Math.random().toString().slice(2, 2 + longitud);
}

export async function POST(req: Request) {
  try {
    const { email, ci, newPassword } = await req.json();
    // console.log('[FORGOT] Email recibido:', email, 'CI:', ci);
    if (!email) {
      // console.log('[FORGOT] Falta email');
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }
    const emailNorm = email.trim().toLowerCase();
    // console.log('[FORGOT] Email normalizado:', emailNorm);
    // Buscar usuario en perfiles usando filtro SQL exacto y campo limpio
    const { data: user, error } = await supabase
      .from('perfiles')
      .select('id, email, nit_ci')
      .eq('email', emailNorm)
      .maybeSingle();
    // console.log('USER:', user);
    // console.log('ERROR:', error);
    // console.log('[FORGOT] Resultado consulta user:', user, 'Error:', error, 'Email buscado:', emailNorm);
    if (error || !user) {
      // Si no está en perfiles, buscar en auth.users
      const { data: authUser, error: authError } = await supabase
        .from('auth.users')
        .select('id, email')
        .eq('email', emailNorm)
        .single();
      if (authUser) {
        return NextResponse.json({ error: 'El correo existe pero no tiene perfil. Contacta soporte.', email_buscado: emailNorm }, { status: 404 });
      }
      return NextResponse.json({ error: 'El correo no está registrado', email_buscado: emailNorm }, { status: 404 });
    }
    // Validar CI/NIT si corresponde
    if (user.nit_ci) {
      // Si no hay CI, pedirlo
      if (!ci) {
        return NextResponse.json({
          ci_required: true,
          message: 'Confirma que eres tú ingresando tu CI'
        });
      }
      // Si el CI es incorrecto, error
      if (ci !== user.nit_ci) {
        return NextResponse.json({
          error: 'CI incorrecto',
          ci_required: true
        }, { status: 401 });
      }
      // Si el CI es correcto y hay nueva contraseña, cambiarla
      if (newPassword && newPassword.length >= 6) {
        const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
        if (updateError) {
          return NextResponse.json({ error: 'No se pudo cambiar la contraseña', details: updateError }, { status: 500 });
        }
        return NextResponse.json({ success: true, message: 'Contraseña cambiada correctamente' });
      }
      // Si el CI es correcto pero no hay nueva contraseña, pedirla
      return NextResponse.json({
        require_new_password: true,
        message: 'Identidad confirmada, ingresa tu nueva contraseña'
      });
    }
    // Si no tiene nit_ci, permitir cambiar contraseña solo con email
    if (newPassword && newPassword.length >= 6) {
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password: newPassword });
      if (updateError) {
        return NextResponse.json({ error: 'No se pudo cambiar la contraseña', details: updateError }, { status: 500 });
      }
      return NextResponse.json({ success: true, message: 'Contraseña cambiada correctamente' });
    }
    return NextResponse.json({
      require_new_password: true,
      message: 'Identidad confirmada, ingresa tu nueva contraseña'
    });
  } catch (err) {
    // console.error('[FORGOT] Error inesperado:', err);
    return NextResponse.json({ error: 'Error inesperado', details: String(err) }, { status: 500 });
  }
}
