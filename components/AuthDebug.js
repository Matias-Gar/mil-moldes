'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/SupabaseClient';

export default function AuthDebug() {
  const [authState, setAuthState] = useState({
    user: null,
    session: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    checkAuth();

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // console.log('Auth State Change:', event, session);
        setAuthState(prev => ({
          ...prev,
          user: session?.user || null,
          session: session,
          loading: false
        }));
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function checkAuth() {
    try {
      // console.log('Verificando autenticación...');
      
      // Verificar sesión
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      // console.log('Sesión:', session, 'Error:', sessionError);
      
      // Verificar usuario
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      // console.log('Usuario:', user, 'Error:', userError);
      
      // Verificar perfil en tabla perfiles
      if (user) {
        const { data: profile, error: profileError } = await supabase
          .from('perfiles')
          .select('rol, nombre')
          .eq('id', user.id)
          .single();
        // console.log('Perfil en perfiles:', profile, 'Error:', profileError);
      }
      
      setAuthState({
        user: user,
        session: session,
        loading: false,
        error: userError || sessionError
      });
      
    } catch (error) {
      // console.error('Error verificando auth:', error);
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error
      }));
    }
  }

  if (authState.loading) {
    return (
      <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
        🔄 Verificando autenticación...
      </div>
    );
  }

  return (
    <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
      <h3 className="font-bold mb-2">🔍 Estado de Autenticación (Debug)</h3>
      
      <div className="space-y-2 text-sm">
        <div>
          <strong>Usuario logueado:</strong> {authState.user ? '✅ Sí' : '❌ No'}
        </div>
        
        {authState.user && (
          <div>
            <strong>Email:</strong> {authState.user.email}
          </div>
        )}
        
        {authState.user && (
          <div>
            <strong>ID:</strong> {authState.user.id}
          </div>
        )}
        
        <div>
          <strong>Sesión activa:</strong> {authState.session ? '✅ Sí' : '❌ No'}
        </div>
        
        {authState.error && (
          <div className="text-red-600">
            <strong>Error:</strong> {authState.error.message}
          </div>
        )}
      </div>
      
      <button
        onClick={checkAuth}
        className="mt-2 bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
      >
        🔄 Verificar de nuevo
      </button>
    </div>
  );
}