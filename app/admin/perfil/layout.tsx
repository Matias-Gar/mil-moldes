"use client";

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/SupabaseClient';
import { useRouter } from 'next/navigation';

export default function PerfilLayout({ children }: { children: React.ReactNode }) {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
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
  }, [router]);

  // Mostrar loading mientras verificamos
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-xl">Verificando permisos...</div>
      </div>
    );
  }

  // Si es admin, usar el layout normal del admin (con sidebar)
  if (userRole === 'admin') {
    return children;
  }

  // Si es usuario normal, usar layout simple sin sidebar
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  );
}