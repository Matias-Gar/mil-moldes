"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/SupabaseClient";

export default function PerfilesAdminPage() {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [perfiles, setPerfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [editingProfile, setEditingProfile] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    nombre: '',
    telefono: '',
    nit_ci: '',
    rol: 'vendedor'
  });

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      
      if (data?.user) {
        setUser(data.user);
        
        // Verificar si es admin
        const { data: perfilData } = await supabase
          .from('perfiles')
          .select('*')
          .eq('id', data.user.id)
          .single();
        
        setUserProfile(perfilData);
        
        if (perfilData?.rol === 'admin') {
          cargarPerfiles();
        }
      }
      setLoading(false);
    };
    getUser();
  }, []);

  const cargarPerfiles = async () => {
    const { data } = await supabase
      .from('perfiles')
      .select('*')
      .order('nombre');
    
    if (data) setPerfiles(data);
  };

  const handleEdit = (perfil) => {
    setEditingProfile(perfil.id);
    setFormData({
      nombre: perfil.nombre || '',
      telefono: perfil.telefono || '',
      nit_ci: perfil.nit_ci || '',
      rol: perfil.rol || 'vendedor'
    });
  };

  const handleSave = async () => {
    if (!editingProfile) return;

    setProcesando(editingProfile);
    try {
      const { error } = await supabase
        .from('perfiles')
        .update({
          nombre: formData.nombre,
          telefono: formData.telefono,
          nit_ci: formData.nit_ci,
          rol: formData.rol
        })
        .eq('id', editingProfile);

      if (error) {
        setMensaje({ tipo: 'error', texto: 'Error al actualizar perfil: ' + error.message });
      } else {
        setMensaje({ tipo: 'success', texto: 'Perfil actualizado exitosamente' });
        setEditingProfile(null);
        cargarPerfiles();
      }
    } catch (_err) {
      setMensaje({ tipo: 'error', texto: 'Error al actualizar el perfil' });
    } finally {
      setProcesando(null);
      setTimeout(() => setMensaje(null), 3000);
    }
  };

  const handleCancel = () => {
    setEditingProfile(null);
    setFormData({
      nombre: '',
      telefono: '',
      nit_ci: '',
      rol: 'vendedor'
    });
  };

  const resetearPassword = async (email) => {
    setProcesando(email);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) {
      setMensaje({ tipo: 'error', texto: 'Error al enviar email: ' + error.message });
    } else {
      setMensaje({ tipo: 'success', texto: `Email de recuperación enviado a ${email}` });
    }
    setProcesando(null);
    setTimeout(() => setMensaje(null), 5000);
  };

  const handleDelete = async (perfilId) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este perfil?')) {
      return;
    }

    setProcesando(perfilId);
    try {
      const { error } = await supabase
        .from('perfiles')
        .delete()
        .eq('id', perfilId);

      if (error) {
        setMensaje({ tipo: 'error', texto: 'Error al eliminar perfil: ' + error.message });
      } else {
        setMensaje({ tipo: 'success', texto: 'Perfil eliminado exitosamente' });
        cargarPerfiles();
      }
    } catch (_err) {
      setMensaje({ tipo: 'error', texto: 'Error al eliminar el perfil' });
    } finally {
      setProcesando(null);
      setTimeout(() => setMensaje(null), 3000);
    }
  };

  // Filtrar perfiles por búsqueda
  const perfilesFiltrados = perfiles.filter(perfil =>
    (perfil.nombre?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (perfil.telefono?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (perfil.nit_ci?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (perfil.rol?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user || userProfile?.rol !== 'admin') {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="text-center p-8">
          <div className="text-red-600 text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">Solo los administradores pueden acceder a esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-full p-3">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold">👥 Administración de Perfiles</h1>
            <p className="text-purple-100">Gestiona usuarios, roles, teléfonos y datos completos</p>
          </div>
        </div>
      </div>

      {/* Mensaje de estado */}
      {mensaje && (
        <div className={`p-4 rounded-lg mb-6 ${
          mensaje.tipo === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-800' 
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {mensaje.tipo === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {mensaje.texto}
          </div>
        </div>
      )}

      {/* Barra de búsqueda */}
      <div className="mb-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="🔍 Buscar por nombre, teléfono, NIT/CI o rol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={cargarPerfiles}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold"
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 text-blue-600 rounded-full p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{perfiles.length}</p>
              <p className="text-gray-600 text-sm">Total Usuarios</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 text-green-600 rounded-full p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.018-4.018A9 9 0 1112.018 21 9 9 0 0120.018 12z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {perfiles.filter(p => p.rol === 'admin').length}
              </p>
              <p className="text-gray-600 text-sm">Administradores</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 text-purple-600 rounded-full p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {perfiles.filter(p => p.telefono).length}
              </p>
              <p className="text-gray-600 text-sm">Con Teléfono</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 text-orange-600 rounded-full p-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {perfiles.filter(p => p.nit_ci).length}
              </p>
              <p className="text-gray-600 text-sm">Con NIT/CI</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de perfiles */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">Lista de Perfiles ({perfilesFiltrados.length})</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4 font-medium text-gray-700">ID</th>
                <th className="text-left p-4 font-medium text-gray-700">Nombre</th>
                <th className="text-left p-4 font-medium text-gray-700">Teléfono</th>
                <th className="text-left p-4 font-medium text-gray-700">NIT/CI</th>
                <th className="text-left p-4 font-medium text-gray-700">Rol</th>
                <th className="text-center p-4 font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {perfilesFiltrados.map((perfil) => (
                <tr key={perfil.id} className="hover:bg-gray-50">
                  <td className="p-4">
                    <div className="text-xs text-gray-500 font-mono">
                      {perfil.id.substring(0, 8)}...
                    </div>
                  </td>
                  <td className="p-4">
                    {editingProfile === perfil.id ? (
                      <input
                        type="text"
                        value={formData.nombre}
                        onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="Nombre completo"
                      />
                    ) : (
                      <div className="font-medium text-gray-900">
                        {perfil.nombre || <span className="text-gray-400 italic">Sin nombre</span>}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    {editingProfile === perfil.id ? (
                      <input
                        type="text"
                        value={formData.telefono}
                        onChange={(e) => setFormData({...formData, telefono: e.target.value})}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="Teléfono"
                      />
                    ) : (
                      <div className="text-sm text-gray-600">
                        {perfil.telefono || <span className="text-gray-400 italic">Sin teléfono</span>}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    {editingProfile === perfil.id ? (
                      <input
                        type="text"
                        value={formData.nit_ci}
                        onChange={(e) => setFormData({...formData, nit_ci: e.target.value})}
                        className="w-full px-2 py-1 border rounded text-sm"
                        placeholder="NIT/CI"
                      />
                    ) : (
                      <div className="text-sm text-gray-600">
                        {perfil.nit_ci || <span className="text-gray-400 italic">Sin NIT/CI</span>}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    {editingProfile === perfil.id ? (
                      <select
                        value={formData.rol}
                        onChange={(e) => setFormData({...formData, rol: e.target.value})}
                        className="w-full px-2 py-1 border rounded text-sm"
                      >
                        <option value="admin">Admin</option>
                        <option value="administracion">Administración</option>
                        <option value="vendedor">Vendedor</option>
                        <option value="almacen">Almacén</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        perfil.rol === 'admin'
                          ? 'bg-red-100 text-red-800' 
                          : perfil.rol === 'administracion'
                          ? 'bg-purple-100 text-purple-800'
                          : perfil.rol === 'vendedor'
                          ? 'bg-blue-100 text-blue-800'
                          : perfil.rol === 'almacen'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {perfil.rol || 'vendedor'}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {editingProfile === perfil.id ? (
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={handleSave}
                          disabled={procesando === perfil.id}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs font-semibold"
                        >
                          ✓ Guardar
                        </button>
                        <button
                          onClick={handleCancel}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-xs font-semibold"
                        >
                          ✗ Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleEdit(perfil)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-semibold"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => resetearPassword(perfil.id)}
                          disabled={procesando === perfil.id}
                          className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs font-semibold"
                        >
                          🔑 Reset
                        </button>
                        <button
                          onClick={() => handleDelete(perfil.id)}
                          disabled={procesando === perfil.id}
                          className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-xs font-semibold"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {perfilesFiltrados.length === 0 && (
          <div className="text-center py-8">
            <div className="text-gray-500 text-lg">
              {searchTerm ? 'No se encontraron perfiles con ese criterio de búsqueda' : 'No hay perfiles registrados'}
            </div>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-blue-800 text-sm">
            <p className="font-medium mb-1">💡 Información importante:</p>
            <ul className="space-y-1 text-blue-700">
              <li>• <strong>Editar:</strong> Permite modificar nombre, teléfono, NIT/CI y rol</li>
              <li>• <strong>Reset:</strong> Envía email de recuperación de contraseña</li>
              <li>• <strong>Eliminar:</strong> Borra completamente el perfil (acción irreversible)</li>
              <li>• <strong>🔍 Búsqueda:</strong> Filtra por cualquier campo (nombre, teléfono, NIT/CI, rol)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}