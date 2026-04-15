import { NextResponse } from 'next/server';

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;

  // 🔒 PROTEGER RUTAS ADMINISTRATIVAS
  if (pathname.startsWith('/admin')) {
    // 🔒 RUTAS SOLO PARA ADMINS (redirigir a perfil si no es admin)
    const adminOnlyRoutes = [
      '/admin/productos',
      '/admin/categorias',
      '/admin/promociones',
      '/admin/ventas',
      '/admin/inventario',
      '/admin/perfiles', // CRÍTICO: Solo admins
      '/admin/whatsapp',
      '/admin/pagos'
    ];

    const isAdminRoute = adminOnlyRoutes.some(route => pathname.startsWith(route));

    if (isAdminRoute) {
      // Por ahora, la validación de admin se hace en cada componente
      // TODO: Implementar validación de sesión cuando tengamos auth-helpers
      // console.log('🔒 Ruta administrativa detectada:', pathname);
    }

    // 🔒 RUTA DE PERFIL: Permitida para usuarios autenticados
    if (pathname === '/admin/perfil') {
      // La validación se hace en el componente
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*']
};
