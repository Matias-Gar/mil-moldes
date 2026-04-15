"use client";

import Sidebar from './Sidebar';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/SupabaseClient';
import { usePathname, useRouter } from 'next/navigation';
import { Toast } from '../../components/ui/Toast';
import { canAccessAdminPath, getDefaultAdminRoute, isAdminPanelRole } from '../../lib/adminPermissions';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          // No hay sesión, redirigir al login
          router.push('/login');
          return;
        }

        // Obtener el rol del usuario
        const { data: profile } = await supabase
          .from('perfiles')
          .select('rol')
          .eq('id', session.user.id)
          .single();
        
        const role = profile?.rol || 'cliente';
        setUserRole(role);

        if (!isAdminPanelRole(role)) {
          router.push('/');
          return;
        }

        if (!canAccessAdminPath(role, pathname)) {
          router.push(getDefaultAdminRoute(role));
          return;
        }
        
      } catch (error) {
        console.error('Error checking user role:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();

    // Suscribirse a cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session) {
          router.push('/login');
        } else {
          checkUserRole();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  // Mostrar loading mientras verificamos
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Verificando permisos...</div>
      </div>
    );
  }

  if (!isAdminPanelRole(userRole) || !canAccessAdminPath(userRole, pathname)) {
    return null; // El redirect ya se maneja en useEffect
  }

  return (
    <div className="flex min-h-screen">
      <Toast />
      {/* Botón hamburguesa solo en móvil - SOLO PARA ADMINS */}
      <button
        className={`fixed top-4 left-4 z-[100] bg-gray-900 text-white p-2 rounded-full shadow-lg focus:outline-none transition-opacity duration-200 ${mobileOpen && 'opacity-0 pointer-events-none'} md:hidden`}
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        style={{ zIndex: 100 }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {/* Botón hamburguesa para desktop - SOLO PARA ADMINS */}
      <button
        className={`hidden md:block fixed top-4 left-4 z-[100] bg-gray-900 text-white p-2 rounded-full shadow-lg focus:outline-none transition-opacity duration-200 ${mobileOpen ? 'opacity-0 pointer-events-none' : ''}`}
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        style={{ zIndex: 100 }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-7 h-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} userRole={userRole} />
      <main className="flex-1 bg-gray-100 p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
