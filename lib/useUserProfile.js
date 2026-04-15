import { useState, useEffect, useCallback } from 'react';
import { supabase } from './SupabaseClient';

export function useUserProfile() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const getProfile = useCallback(async (id) => {
    if (!id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // usar tabla 'perfiles' de forma consistente
      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setProfile(data || null);
    } catch (err) {
      // console.error('useUserProfile - getProfile error:', err);
      setProfile(null);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []); // referencia estable para usar en useEffect

  useEffect(() => {
    // obtener usuario actual al montar y cargar su perfil
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const currentUser = data?.user ?? null;
        if (!mounted) return;
        setUser(currentUser);
        if (currentUser?.id) {
          await getProfile(currentUser.id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        // console.error('useUserProfile - init error:', err);
        setLoading(false);
      }
    })();

    // escuchar cambios de auth
    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user);
          await getProfile(session.user.id);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      if (subscription?.unsubscribe) subscription.unsubscribe();
    };
  }, [getProfile]); // getProfile incluido para silenciar ESLint

  async function updateProfile(updates) {
    try {
      if (!user) throw new Error('No hay usuario autenticado');

      const { error } = await supabase
        .from('perfiles')
        .upsert({
          id: user.id,
          rol: 'cliente', // Asegurar rol por defecto
          ...updates
        });

      if (error) throw error;

      await getProfile(user.id);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }

  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      setProfile(null);
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }

  return {
    user,
    profile,
    loading,
    error,
    updateProfile,
    signOut,
    refreshProfile: () => getProfile(user?.id)
  };
}