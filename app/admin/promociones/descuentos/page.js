"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/SupabaseClient";
import { Card, CardHeader, CardTitle, CardContent } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { PrecioConPromocion } from "../../../../lib/promociones";
import { useSucursalActiva } from "../../../../components/admin/SucursalContext";

export default function PromocionesDescuentosPage() {
  const { activeSucursalId } = useSucursalActiva();
  const [productosConPromociones, setProductosConPromociones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editandoPromo, setEditandoPromo] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todas"); // todas, activas, pausadas

  // Cargar productos que tienen promociones activas
  useEffect(() => {
    fetchProductosConPromociones();
  }, [activeSucursalId]);

  const fetchProductosConPromociones = async () => {
    setLoading(true);
    try {
      // Consulta para obtener productos con TODAS sus promociones (activas e inactivas)
      let query = supabase
        .from("promociones")
        .select(`
          *,
          productos!inner (
            user_id,
            nombre,
            precio,
            stock,
            categoria,
            descripcion
          )
        `)
        .order('activa', { ascending: false }) // Primero las activas
        .order('id', { ascending: false });
      if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);
      const { data: promocionesData, error: promoError } = await query;

      if (promoError) {
        console.error("Error al cargar promociones:", promoError);
        alert("Error al cargar datos: " + promoError.message);
      } else if (promocionesData) {
        setProductosConPromociones(promocionesData);
      }
    } catch (error) {
      console.error("Error general:", error);
      alert("Error al cargar datos: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar por búsqueda y estado
  const promocionesFiltradas = productosConPromociones.filter(item => {
    // Filtro de búsqueda
    const matchBusqueda = item.productos.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      item.descripcion?.toLowerCase().includes(busqueda.toLowerCase());
    
    // Filtro de estado
    const matchEstado = filtroEstado === "todas" ||
      (filtroEstado === "activas" && item.activa) ||
      (filtroEstado === "pausadas" && !item.activa);
    
    return matchBusqueda && matchEstado;
  });

  // Estadísticas
  const promocionesActivas = productosConPromociones.filter(item => item.activa).length;
  const promocionesPausadas = productosConPromociones.filter(item => !item.activa).length;

  // Editar promoción
  const editarPromocion = async () => {
    if (!editandoPromo) return;

    setLoading(true);
    try {
      let query = supabase
        .from("promociones")
        .update({
          tipo: editandoPromo.tipo,
          valor: parseFloat(editandoPromo.valor),
          descripcion: editandoPromo.descripcion,
          fecha_inicio: editandoPromo.fecha_inicio,
          fecha_fin: editandoPromo.fecha_fin,
          activa: editandoPromo.activa
        })
        .eq("id", editandoPromo.id);
      if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);
      const { error } = await query;

      if (error) throw error;

      setEditandoPromo(null);
      await fetchProductosConPromociones();
      alert("Promoción actualizada exitosamente");
    } catch (error) {
      console.error("Error al editar promoción:", error);
      alert("Error al editar promoción: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Función para alternar estado de promoción (activar/pausar)
  const togglePromocion = async (promocionId, estadoActual) => {
    try {
      const nuevoEstado = !estadoActual;
      
      let query = supabase
        .from('promociones')
        .update({ activa: nuevoEstado })
        .eq('id', promocionId);
      if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);
      const { error } = await query;

      if (error) {
        console.error('Error al cambiar estado de promoción:', error);
        alert('Error al cambiar el estado de la promoción');
        return;
      }

      // Actualizar el estado local
      setProductosConPromociones(prevProductos => 
        prevProductos.map(item => 
          item.id === promocionId 
            ? { ...item, activa: nuevoEstado }
            : item
        )
      );

      alert(`Promoción ${nuevoEstado ? 'activada' : 'pausada'} correctamente`);
    } catch (error) {
      console.error('Error al cambiar estado:', error);
      alert('Error al cambiar el estado de la promoción');
    }
  };

  // Eliminar promoción
  const eliminarPromocion = async (promoId) => {
    setLoading(true);
    try {
      let query = supabase.from("promociones").delete().eq("id", promoId);
      if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);
      const { error } = await query;
      if (error) throw error;

      await fetchProductosConPromociones();
      alert("Promoción eliminada exitosamente");
    } catch (error) {
      console.error("Error al eliminar promoción:", error);
      alert("Error al eliminar promoción: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Función para resaltar texto de búsqueda
  const resaltarTexto = (texto, busqueda) => {
    if (!busqueda.trim()) return texto;
    
    const regex = new RegExp(`(${busqueda.trim()})`, 'gi');
    const partes = texto.split(regex);
    
    return partes.map((parte, index) => 
      regex.test(parte) ? (
        <span key={index} className="bg-yellow-200 font-bold text-black px-1 rounded">
          {parte}
        </span>
      ) : (
        parte
      )
    );
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-black mb-2">
            🎯 Gestión de Promociones
          </h1>
          <p className="text-gray-800 font-medium">
            Gestiona todas tus promociones: activas, pausadas y vencidas
          </p>
        </div>

        {/* Búsqueda y estadísticas */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-bold text-black mb-2">
                  Buscar promoción
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar por producto o descripción..."
                    className="w-full p-2 pr-8 border border-gray-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black font-medium"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    autoComplete="off"
                  />
                  {busqueda && (
                    <button
                      onClick={() => setBusqueda('')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      type="button"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {busqueda && (
                  <div className="text-xs text-blue-600 mt-1 font-medium">
                    📋 {promocionesFiltradas.length} promociones encontradas
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-black mb-2">
                  Estado
                </label>
                <select
                  className="w-full p-2 border border-gray-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black font-medium"
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                >
                  <option value="todas">📋 Todas las promociones</option>
                  <option value="activas">✅ Solo activas ({promocionesActivas})</option>
                  <option value="pausadas">⏸️ Solo pausadas ({promocionesPausadas})</option>
                </select>
              </div>

              <div className="flex items-end">
                <Button 
                  onClick={fetchProductosConPromociones} 
                  className="w-full font-bold"
                  variant="outline"
                >
                  🔄 Actualizar
                </Button>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-green-50 p-4 rounded-lg border-2 border-blue-200">
                <div className="text-sm font-bold text-black">Estadísticas</div>
                <div className="text-lg font-bold text-blue-800">
                  Total: {productosConPromociones.length}
                </div>
                <div className="text-sm text-green-700 font-medium">
                  ✅ Activas: {promocionesActivas}
                </div>
                <div className="text-sm text-orange-700 font-medium">
                  ⏸️ Pausadas: {promocionesPausadas}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabla de promociones */}
        <Card>
          <CardHeader>
            <CardTitle>
              {busqueda ? (
                <span>
                  🔍 Resultados: &quot;{busqueda}&quot; 
                  <span className="text-blue-600"> ({promocionesFiltradas.length} de {productosConPromociones.length})</span>
                </span>
              ) : (
                <span>
                  {filtroEstado === "todas" && `📋 Todas las Promociones (${productosConPromociones.length} total)`}
                  {filtroEstado === "activas" && `✅ Promociones Activas (${promocionesActivas} total)`}
                  {filtroEstado === "pausadas" && `⏸️ Promociones Pausadas (${promocionesPausadas} total)`}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-black font-bold">Cargando promociones...</p>
              </div>
            ) : promocionesFiltradas.length === 0 ? (
              <div className="text-center py-8">
                {busqueda ? (
                  <div>
                    <div className="text-black font-bold text-lg">
                      🔍 No se encontraron promociones con &quot;{busqueda}&quot;
                    </div>
                    <div className="text-gray-600 mt-2">
                      Intenta con otras palabras o verifica la ortografía
                    </div>
                    <Button 
                      onClick={() => setBusqueda('')}
                      className="mt-3"
                      variant="outline"
                    >
                      Limpiar búsqueda
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="text-black font-bold text-lg">
                      📭 No hay promociones
                      {filtroEstado === "activas" && " activas"}
                      {filtroEstado === "pausadas" && " pausadas"}
                    </div>
                    <div className="text-gray-600 mt-2">
                      {filtroEstado === "pausadas" 
                        ? "No tienes promociones en pausa en este momento"
                        : "Ve a 'Productos' para crear nuevas promociones"
                      }
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-auto border-collapse">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="border border-gray-400 px-4 py-3 text-left font-bold text-black">
                        Producto
                      </th>
                      <th className="border border-gray-400 px-4 py-3 text-left font-bold text-black">
                        Precio Original
                      </th>
                      <th className="border border-gray-400 px-4 py-3 text-left font-bold text-black">
                        Promoción
                      </th>
                      <th className="border border-gray-400 px-4 py-3 text-left font-bold text-black">
                        Precio Final
                      </th>
                      <th className="border border-gray-400 px-4 py-3 text-left font-bold text-black">
                        Vigencia
                      </th>
                      <th className="border border-gray-400 px-4 py-3 text-left font-bold text-black">
                        Estado
                      </th>
                      <th className="border border-gray-400 px-4 py-3 text-left font-bold text-black">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {promocionesFiltradas.map(item => {
                      const producto = item.productos;
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="border border-gray-400 px-4 py-3">
                            <div>
                              <div className="font-bold text-black text-lg">
                                {resaltarTexto(producto.nombre, busqueda)}
                              </div>
                              <div className="text-sm text-gray-700">
                                Categoría: {producto.categoria || 'Sin categoría'}
                              </div>
                              <div className="text-sm text-gray-700">
                                Stock: {producto.stock} unidades
                              </div>
                              {item.descripcion && (
                                <div className="text-sm text-blue-600 mt-1">
                                  📝 {resaltarTexto(item.descripcion, busqueda)}
                                </div>
                              )}
                            </div>
                          </td>
                          
                          <td className="border border-gray-400 px-4 py-3">
                            <span className="font-bold text-black text-lg">
                              Bs {Number(producto.precio).toFixed(2)}
                            </span>
                          </td>
                          
                          <td className="border border-gray-400 px-4 py-3">
                            <div className="bg-green-100 p-2 rounded-lg">
                              <div className="font-bold text-green-800">
                                {item.tipo === 'descuento' && `🏷️ ${item.valor}% OFF`}
                                {item.tipo === 'precio_fijo' && `💰 Precio fijo: Bs ${item.valor}`}
                                {item.tipo === 'descuento_absoluto' && `💸 Descuento: Bs ${item.valor}`}
                              </div>
                            </div>
                          </td>
                          
                          <td className="border border-gray-400 px-4 py-3">
                            <PrecioConPromocion 
                              producto={producto} 
                              promociones={[item]}
                            />
                          </td>
                          
                          <td className="border border-gray-400 px-4 py-3">
                            <div className="text-sm">
                              {item.fecha_inicio && (
                                <div className="text-gray-700">
                                  📅 Desde: {new Date(item.fecha_inicio).toLocaleDateString()}
                                </div>
                              )}
                              {item.fecha_fin ? (
                                <div className="text-red-600 font-medium">
                                  ⏰ Hasta: {new Date(item.fecha_fin).toLocaleDateString()}
                                </div>
                              ) : (
                                <div className="text-green-600 font-medium">
                                  ♾️ Sin límite de tiempo
                                </div>
                              )}
                            </div>
                          </td>
                          
                          <td className="border border-gray-400 px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${
                              item.activa ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'
                            }`}>
                              {item.activa ? '✅ Activa' : '⏸️ Pausada'}
                            </span>
                            {!item.activa && (
                              <div className="text-xs text-gray-600 mt-1">
                                No se aplica descuento
                              </div>
                            )}
                          </td>
                          
                          <td className="border border-gray-400 px-4 py-3">
                            <div className="flex gap-2">
                              <Button
                                onClick={() => setEditandoPromo(item)}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 font-bold"
                              >
                                ✏️ Editar
                              </Button>
                              <Button
                                onClick={() => togglePromocion(item.id, item.activa)}
                                size="sm"
                                variant="outline"
                                className="font-bold"
                              >
                                {item.activa ? '⏸️ Pausar' : '▶️ Activar'}
                              </Button>
                              <Button
                                onClick={() => eliminarPromocion(item.id)}
                                size="sm"
                                variant="destructive"
                                className="font-bold"
                              >
                                🗑️ Eliminar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de edición */}
        {editandoPromo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold text-black mb-4">
                ✏️ Editar Promoción - {editandoPromo.productos.nombre}
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-black mb-2">
                    Tipo de promoción
                  </label>
                  <select
                    className="w-full p-2 border border-gray-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black font-medium"
                    value={editandoPromo.tipo}
                    onChange={(e) => setEditandoPromo({...editandoPromo, tipo: e.target.value})}
                  >
                    <option value="descuento">Descuento (%)</option>
                    <option value="precio_fijo">Precio fijo</option>
                    <option value="descuento_absoluto">Descuento absoluto (Bs)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-black mb-2">
                    Valor
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full p-2 border border-gray-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black font-medium"
                    value={editandoPromo.valor}
                    onChange={(e) => setEditandoPromo({...editandoPromo, valor: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-black mb-2">
                    Descripción
                  </label>
                  <input
                    type="text"
                    className="w-full p-2 border border-gray-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black font-medium"
                    value={editandoPromo.descripcion || ''}
                    onChange={(e) => setEditandoPromo({...editandoPromo, descripcion: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-black mb-2">
                    Fecha inicio
                  </label>
                  <input
                    type="date"
                    className="w-full p-2 border border-gray-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black font-medium"
                    value={editandoPromo.fecha_inicio || ''}
                    onChange={(e) => setEditandoPromo({...editandoPromo, fecha_inicio: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-black mb-2">
                    Fecha fin
                  </label>
                  <input
                    type="date"
                    className="w-full p-2 border border-gray-400 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-black font-medium"
                    value={editandoPromo.fecha_fin || ''}
                    onChange={(e) => setEditandoPromo({...editandoPromo, fecha_fin: e.target.value})}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="activa"
                    checked={editandoPromo.activa}
                    onChange={(e) => setEditandoPromo({...editandoPromo, activa: e.target.checked})}
                  />
                  <label htmlFor="activa" className="text-sm font-bold text-black">
                    Promoción activa
                  </label>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  onClick={() => setEditandoPromo(null)}
                  variant="outline"
                  className="flex-1 font-bold"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={editarPromocion}
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 font-bold"
                >
                  💾 Guardar
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
