'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/SupabaseClient';
import { useRouter } from 'next/navigation';
import UserProfile from '../../components/UserProfile';
import AuthDebug from '../../components/AuthDebug';

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showDebug] = useState(false); // Debug oculto por defecto
  const router = useRouter();

  useEffect(() => {
    async function checkUser() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) throw error;
        
        if (!user) {
          router.push('/login');
          return;
        }

        setUser(user);
      } catch (error) {
        // console.error('Error verificando usuario:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }

    checkUser();
  }, [router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white shadow-sm border-b mb-8">
          <div className="flex justify-between items-center h-16 px-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="text-gray-600 hover:text-gray-800"
              >
                ← Volver
              </button>
              <h1 className="text-xl font-semibold text-gray-800">
                Mi Perfil
              </h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-gray-600 text-sm">
                {user.email}
              </span>
              
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push('/');
                }}
                className="bg-gray-500 text-white px-3 py-2 rounded-md text-sm hover:bg-gray-600 transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        {/* Debug Component */}
        {showDebug && <AuthDebug />}

        {/* Profile Component */}
        <UserProfile />
      </div>
    </div>
  );
}