"use client";
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { supabase } from "../lib/SupabaseClient";

export default function PerfilForm({ userId, perfilActual, onSave, isAdminEdit = false }) {
  const [nombre, setNombre] = useState("");
  const [nitCi, setNitCi] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fotoPerfil, setFotoPerfil] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [message, setMessage] = useState("");
  const [currentUserId, setCurrentUserId] = useState(null);

  // 🔒 SEGURIDAD: Verificar identidad del usuario actual
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (!userId) return;
    
    // Cargar datos del perfil con reintentos
    const cargarPerfil = async () => {
      try {
        if (perfilActual) {
          // console.log('Usando perfil actual:', perfilActual);
          setNombre(perfilActual.nombre || "");
          setNitCi(perfilActual.nit_ci || "");
          setTelefono(perfilActual.telefono || "");
          setFotoPerfil(perfilActual.foto_perfil || "");
        } else {
          // console.log('Cargando perfil desde base de datos para userId:', userId);
          
          // Intentar cargar perfil con manejo de errores mejorado
          const { data, error } = await supabase
            .from("perfiles")
            .select("nombre, nit_ci, telefono, foto_perfil")
            .eq("id", userId)
            .maybeSingle(); // Usar maybeSingle en lugar de single
          
          if (error) {
            // Si hay error, dejamos campos vacíos para crear nuevo perfil
            setNombre("");
            setNitCi("");
            setTelefono("");
            setFotoPerfil("");
          } else if (data) {
            setNombre(data.nombre || "");
            setNitCi(data.nit_ci || "");
            setTelefono(data.telefono || "");
            setFotoPerfil(data.foto_perfil || "");
          } else {
            setNombre("");
            setNitCi("");
            setTelefono("");
            setFotoPerfil("");
          }
        }
      } catch (error) {
        console.error('Error inesperado cargando perfil:', error);
        // En caso de error, inicializar campos vacíos
        setNombre("");
        setNitCi("");
        setTelefono("");
        setFotoPerfil("");
      }
    };
    
    cargarPerfil();
  }, [userId, perfilActual]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage("❌ Solo se permiten archivos de imagen");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage("❌ La imagen debe ser menor a 2MB");
      return;
    }

    setUploadingFoto(true);
    setMessage("");

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { error } = await supabase.storage
        .from('perfiles')
        .upload(fileName, file, { cacheControl: '3600', upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('perfiles')
        .getPublicUrl(fileName);

      setFotoPerfil(publicUrl);
      setMessage("✅ Foto subida correctamente");
      setTimeout(() => setMessage(""), 3000);
    } catch (error) {
      setMessage("❌ Error al subir foto: " + error.message);
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    
    // 🔒 SEGURIDAD CRÍTICA: Verificar que solo pueda editar SU PROPIO perfil
    if (!isAdminEdit && currentUserId !== userId) {
      setMessage("❌ Error de seguridad: No puedes editar este perfil");
      setLoading(false);
      return;
    }
    
    
    try {
      // Verificar sesión activa
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setMessage("❌ Sesión expirada. Por favor, inicia sesión nuevamente");
        setLoading(false);
        return;
      }
      
      // 🔒 DOBLE VERIFICACIÓN: Solo el usuario actual puede editar su perfil
      if (!isAdminEdit && session.user.id !== userId) {
        setMessage("❌ Error de autorización: Operación no permitida");
        setLoading(false);
        return;
      }
      
      // Verificar si el perfil existe (con mejor manejo de errores)
      const { data: perfilExistente, error: errorCheck } = await supabase
        .from("perfiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      
      
      let result;
      // 🔒 DATOS SEGUROS: Solo campos permitidos para usuarios normales
      const datosActualizar = {
        nombre: nombre.trim(),
        nit_ci: nitCi.trim(),
        telefono: telefono.trim(),
        foto_perfil: fotoPerfil || null
        // 🚫 NO incluir 'rol' - solo admins pueden cambiar roles
      };
      
      if (perfilExistente) {
        // ACTUALIZAR perfil existente
        result = await supabase
          .from("perfiles")
          .update(datosActualizar)
          .eq("id", userId)
          .select();
      } else {
        // CREAR nuevo perfil (rol por defecto: cliente)
        result = await supabase
          .from("perfiles")
          .insert({
            id: userId,
            ...datosActualizar,
            rol: 'cliente' // 🔒 ROL POR DEFECTO: cliente
          })
          .select();
      }
      
      
      if (result.error) {
        console.error('Error de Supabase:', result.error);
        setMessage("❌ Error: " + (result.error.message || "Error desconocido"));
      } else {
        setMessage("✅ Perfil guardado correctamente");
        if (onSave) onSave();
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      console.error('Error inesperado:', error);
      setMessage("❌ Error inesperado: " + (error.message || "Error desconocido"));
    }
    
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg text-center font-medium ${
          message.includes('❌') 
            ? 'bg-red-50 border border-red-200 text-red-700' 
            : 'bg-green-50 border border-green-200 text-green-700'
        }`}>
          {message}
        </div>
      )}
      
      {/* Foto de perfil */}
      <div className="text-center">
        <div className="mb-4">
          {fotoPerfil ? (
            <Image 
              src={fotoPerfil} 
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
        </div>
        
        <div className="relative inline-block">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={uploadingFoto}
          />
          <button
            type="button"
            disabled={uploadingFoto}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {uploadingFoto ? "Subiendo..." : fotoPerfil ? "Cambiar Foto" : "Subir Foto"}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Máximo 2MB • JPG, PNG, GIF</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre Completo *
            </label>
            <input
              type="text"
              placeholder="Escribe tu nombre completo"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Teléfono *
            </label>
            <input
              type="tel"
              placeholder="Ej: 70123456"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
              required
            />
          </div>
          
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              NIT/CI *
            </label>
            <input
              type="text"
              placeholder="Número de identificación"
              value={nitCi}
              onChange={e => setNitCi(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500"
              required
            />
          </div>
        </div>
        
        <div className="text-center">
          <button
            type="submit"
            disabled={loading || !nombre.trim() || !nitCi.trim() || !telefono.trim()}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-8 rounded-lg transition-colors text-lg"
          >
            {loading ? "Guardando..." : "💾 Editar Perfil"}
          </button>
        </div>
      </form>
    </div>
  );
}
