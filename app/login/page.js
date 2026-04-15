// app/login/page.js

"use client";
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
// USAR ALIAS DE RAIZ (ahora que tsconfig.json está listo)
import { supabase } from '@/lib/SupabaseClient'; 
import AuthForm from '@/components/AuthForm'; 
// ...
export default function LoginPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);

    // Función unificada para verificar rol y redirigir
    const checkRoleAndRedirect = useCallback(async (userId) => {
        setIsLoading(true);
        try {
            const { data: profile, error: profileError } = await supabase
            .from('perfiles')
            .select('rol')
            .eq('id', userId)
            .single();

            if (profileError) {
    // console.error("Error al obtener el perfil:", profileError.message);
                router.push("/"); 
                return;
            }

            if (profile?.rol === 'admin') {
                router.push('/admin');
            } else {
                router.push('/');
            }
        } catch (error) {
    // console.error("Error en la redirección por rol:", error.message);
            router.push('/');
        } finally {
            // Aseguramos que la carga termine si no se pudo redirigir por alguna razón.
            setIsLoading(false); 
        }
    }, [router]);

    useEffect(() => {
        const checkSession = async () => {
            // Supabase.auth.getSession() no requiere try/catch
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
                // Si ya hay sesión, intentar redirigir
                checkRoleAndRedirect(session.user.id);
            } else {
                // Si no hay sesión, mostrar formulario
                setIsLoading(false);
            }
        };

        checkSession();

        // Escuchar cambios de autenticación (login/logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
             if (event === 'SIGNED_IN' && session) {
                 checkRoleAndRedirect(session.user.id);
             } else if (event === 'SIGNED_OUT') {
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
                    <p className="text-lg font-medium text-gray-800">Verificando sesión...</p>
                </div>
            </div>
        );
    }    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
            <h1 className="text-4xl font-extrabold text-gray-800 mb-8">
                Portal de Acceso
            </h1>
            <AuthForm onLoginSuccess={checkRoleAndRedirect} />
        </div>
    );
}