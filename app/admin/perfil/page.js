"use client";
import dynamic from "next/dynamic";
const SafeImage = dynamic(() => import("../../../components/SafeImage"), { ssr: false });
const PerfilForm = dynamic(() => import("../../../components/PerfilForm.client"), { ssr: false });
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/SupabaseClient";
import { useRouter } from "next/navigation";

export default function PerfilPage() {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const getUser = async () => {
      try {
        // 1. Verificar que el usuario esté autenticado
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session?.user) {
          router.push('/login');
          return;
        }

        const currentUser = session.user;
        setUser(currentUser);

        // 2. SEGURIDAD: Solo permitir acceso a SU PROPIO perfil
        // Verificar que no pueda editar otros perfiles
        const { data: perfilData, error: perfilError } = await supabase
          .from('perfiles')
          .select('*')
          .eq('id', currentUser.id) // CRÍTICO: Solo SU perfil
          .single();
        
        if (perfilError && perfilError.code !== 'PGRST116') { // PGRST116 = no rows
          console.error('❌ Error cargando perfil:', perfilError);
          router.push('/');
          return;
        }

        // 3. Establecer datos seguros
        const finalPerfil = perfilData || {
          id: currentUser.id,
          email: currentUser.email,
          nombre: '',
          telefono: '',
          nit_ci: '',
          rol: 'cliente', // Por defecto cliente
          foto_url: null
        };
        
        setPerfil(finalPerfil);
        setAuthorized(true);
        
      } catch (error) {
        console.error('❌ Error de autorización:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    
    getUser();
  }, [router]);

  const recargarPerfil = async () => {
    if (user && authorized) {
      // SEGURIDAD: Solo permitir recargar SU PROPIO perfil
      const { data: perfilData } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', user.id) // CRÍTICO: Solo SU perfil
        .single();
      
      setPerfil(perfilData);
      setEditando(false);
    }
  };

  // SEGURIDAD: Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  // SEGURIDAD: Bloquear acceso no autorizado
  if (!user || !authorized) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center p-8">
          <div className="text-red-600 text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600 mb-4">No tienes permisos para acceder a esta página.</p>
          <button 
            onClick={() => router.push('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-full p-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Mi Perfil</h1>
            <p className="text-blue-100">
              {editando ? "Editando información personal" : "Información personal"}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6">
        {!editando ? (
          // MODO VISUALIZACIÓN - Mostrar datos actuales
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Mi Información Personal
              </h2>
              <button
                onClick={() => setEditando(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar Perfil
              </button>
            </div>

            {/* Información actual del perfil */}
            <div className="grid md:grid-cols-2 gap-8">
              {/* Foto de perfil */}
              <div className="text-center">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Foto de Perfil</h3>
                {perfil?.foto_perfil ? (
                  <SafeImage
                    src={perfil.foto_perfil}
                    alt="Foto de perfil"
                    width={128}
                    height={128}
                    className="w-32 h-32 rounded-full mx-auto object-cover border-4 border-blue-200 shadow-lg"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full mx-auto bg-gray-200 flex items-center justify-center border-4 border-gray-300">
                    <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  {perfil?.foto_perfil ? "Foto actual" : "Sin foto de perfil"}
                </p>
              </div>

              {/* Información personal */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre Completo
                  </label>
                  <div className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                    {perfil?.nombre || "No especificado"}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    NIT/CI
                  </label>
                  <div className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                    {perfil?.nit_ci || "No especificado"}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <div className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                    {user?.email || "No especificado"}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    El email se gestiona desde la configuración de cuenta
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // MODO EDICIÓN - Formulario editable
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editando Mi Perfil
              </h2>
              <button
                onClick={() => setEditando(false)}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancelar
              </button>
            </div>
            
            <PerfilForm 
              userId={user.id} 
              perfilActual={perfil} 
              onSave={recargarPerfil}
            />
          </div>
        )}
      </div>

      {/* Link a administración de perfiles (solo para admin) */}
      {perfil?.rol === 'admin' && (
        <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-orange-500 text-white rounded-full p-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-orange-800">Panel de Administración</h3>
                <p className="text-orange-600 text-sm">Gestiona todos los perfiles de usuarios</p>
              </div>
            </div>
            <a 
              href="/admin/perfiles" 
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Ir a Perfiles
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
