"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from "../../lib/SupabaseClient";
import Link from 'next/link'; // ¡Importación necesaria para el botón!
import { ADMIN_MENU, canAccessAdminPath, filterAdminMenuByRole, isAdminPanelRole } from '../../lib/adminPermissions';

export default function AdminDashboard() {
    const [userRole, setUserRole] = useState(null); 
    const router = useRouter();

    useEffect(() => {
        const checkAuthAndRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push('/login');
                setUserRole('not_logged'); 
                return;
            }

            // 1. Verificar el rol en la base de datos
            const { data: profile, error } = await supabase
                .from('perfiles')
                .select('rol')
                .eq('id', user.id)
                .single();
            
            if (error) {
                console.error("Error al obtener perfil:", error.message);
                setUserRole('cliente'); 
                router.push('/');
                return;
            }

            if (profile) {
                setUserRole(profile.rol);
            } else {
                setUserRole('cliente'); 
                router.push('/');
                return;
            }
            
            if (!isAdminPanelRole(profile.rol) || !canAccessAdminPath(profile.rol, '/admin')) {
                router.push('/');
            }
        };

        checkAuthAndRole();
    }, [router]);
    
    // Muestra pantalla de carga mientras se verifica el rol
    if (userRole === null) {
        return <div className="min-h-screen flex items-center justify-center text-xl font-medium text-gray-700">Verificando permisos, por favor espera...</div>;
    }

    if (!isAdminPanelRole(userRole) || !canAccessAdminPath(userRole, '/admin')) {
        return <div className="min-h-screen flex items-center justify-center text-xl font-medium text-red-500">Acceso denegado. Redirigiendo...</div>;
    }

    const quickLinks = filterAdminMenuByRole(userRole, ADMIN_MENU)
        .flatMap((item) => Array.isArray(item.children) ? item.children : (item.path ? [item] : []))
        .slice(0, 8);

    return (
        <div className="min-h-screen p-8 bg-gray-100 flex flex-col items-center justify-center">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">Panel de Administración 🛠️</h1>
            <p className="mb-8 text-gray-600 text-lg text-center max-w-xl">
                Bienvenido al panel de administración. Aquí puedes ver la información general de la tienda y acceder a las funciones administrativas desde el menú lateral.
            </p>
            {/* Aquí puedes agregar información/resumen de la tienda si lo deseas */}
            <button onClick={() => supabase.auth.signOut()} className="mt-10 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                Cerrar Sesión
            </button>
        </div>
    );
}
