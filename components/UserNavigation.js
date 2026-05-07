'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/SupabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function UserNavigation() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);
  const router = useRouter();

  const loadProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setProfile(data);
    } catch (error) {
      // console.error('Error cargando perfil:', error);
    }
  }, []);

  const getUser = useCallback(async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      
      if (user) {
        setUser(user);
        await loadProfile(user.id);
      }
    } catch (error) {
      // console.error('Error obteniendo usuario:', error);
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          await loadProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [getUser, loadProfile]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch (error) {
        // console.error('Error cerrando sesión:', error);
    }
  }

  if (loading) {
    return (
      <div className="bg-white shadow-sm border-b h-16 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-xl font-bold text-gray-800">
              Catálogo
            </Link>
            
            <div className="flex items-center space-x-4">
              <Link 
                href="/login"
                className="bg-blue-500 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-600 transition-colors"
              >
                Iniciar Sesión
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'Usuario';
  const firstName = displayName.split(' ')[0];

  return (
    <div className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/" className="text-xl font-bold text-gray-800">
              Catálogo
            </Link>
            
            <nav className="hidden md:flex items-center space-x-4">
              <Link 
                href="/productos"
                className="text-gray-600 hover:text-gray-800 transition-colors"
              >
                Productos
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-gray-600 text-sm hidden sm:block">
              Hola, {firstName}
            </span>
            
            {/* Dropdown del perfil */}
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 focus:outline-none"
              >
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt="Avatar"
                      className="w-8 h-8 rounded-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : (
                    <span className="text-sm text-gray-500">
                      {firstName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <svg 
                  className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                  <div className="py-1">
                    <div className="px-4 py-2 text-sm text-gray-600 border-b">
                      {user.email}
                    </div>
                    
                    <Link
                      href="/perfil"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      onClick={() => setShowDropdown(false)}
                    >
                      Mi Perfil
                    </Link>
                    
                    <button
                      onClick={() => {
                        setShowDropdown(false);
                        handleSignOut();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      Cerrar Sesión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Overlay para cerrar dropdown al hacer click fuera */}
      {showDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowDropdown(false)}
        ></div>
      )}
    </div>
  );
}