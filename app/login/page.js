"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/SupabaseClient';
import AuthForm from '@/components/AuthForm';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  const checkRoleAndRedirect = useCallback(async (userId) => {
    setIsLoading(true);
    try {
      const { data: profile, error: profileError } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', userId)
        .single();

      if (profileError) {
        router.push("/");
        return;
      }

      if (profile?.rol === 'admin') {
        router.push('/admin');
      } else {
        router.push('/');
      }
    } catch (_error) {
      router.push('/');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        checkRoleAndRedirect(session.user.id);
      } else {
        setIsLoading(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setIsLoading(false);
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [router, checkRoleAndRedirect]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-800">Verificando sesion...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <h1 className="text-4xl font-extrabold text-gray-800 mb-8">
        Portal de Acceso
      </h1>
      <AuthForm onLoginSuccess={checkRoleAndRedirect} />
    </div>
  );
}
