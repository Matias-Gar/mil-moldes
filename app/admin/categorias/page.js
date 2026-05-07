"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/SupabaseClient";
import { showToast } from "../../../components/ui/Toast";
import { useSucursalActiva } from "../../../components/admin/SucursalContext";

export default function AdminCategorias() {
  const router = useRouter();
  const { activeSucursalId } = useSucursalActiva();

  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [editando, setEditando] = useState(null);
  const [nombreEdit, setNombreEdit] = useState("");

  useEffect(() => {
    if (!activeSucursalId) return;
    fetchCategorias();
    fetchProductos();
  }, [activeSucursalId]);

  async function fetchCategorias() {
    let query = supabase.from("categorias").select("*");
    if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);
    const { data, error } = await query;
    if (error) {
      showToast("Error al cargar categorías", "error");
    } else {
      setCategorias(data || []);
    }
  }

  async function fetchProductos() {
    let query = supabase.from("productos").select("*");
    if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);
    const { data, error } = await query;
    if (error) {
      showToast("Error al cargar productos", "error");
    } else {
      setProductos(data || []);
    }
  }

  async function handleAgregar(e) {
    e.preventDefault();
    if (!nuevaCategoria.trim()) return;

    const { error } = await supabase
      .from("categorias")
      .insert({ categori: nuevaCategoria, sucursal_id: activeSucursalId });

    if (error) {
      showToast("Error al agregar la categoría", "error");
    } else {
      setNuevaCategoria("");
      fetchCategorias();
      showToast("Categoría agregada con éxito");
      // si venimos de la página de producto nuevo, volvemos automáticamente
      const params = new URLSearchParams(window.location.search);
      if (params.get('return') === 'productos_nuevo') {
        router.push('/admin/productos/nuevo');
      }
    }
  }

  async function handleEliminar(id) {
    if (!confirm("¿Eliminar esta categoría?")) return;

    let query = supabase.from("categorias").delete().eq("id", id);
    if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);
    const { error } = await query;

    if (error) {
      showToast("Error al eliminar la categoría", "error");
    } else {
      fetchCategorias();
      showToast("Categoría eliminada");
    }
  }

  async function handleGuardarEdit(id) {
    if (!nombreEdit.trim()) return;

    const { error } = await supabase
      .from("categorias")
      .update({ categori: nombreEdit })
      .eq("id", id)
      .eq("sucursal_id", activeSucursalId);

    if (error) {
      showToast("Error al guardar la categoría", "error");
    } else {
      setEditando(null);
      setNombreEdit("");
      fetchCategorias();
      showToast("Categoría actualizada");
    }
  }

  function openCatalogPage() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/admin/productos/catalogo`
        : "/admin/productos/catalogo";

    const win = typeof window !== "undefined" && window.open(url, "_blank");
    if (!win) router.push("/admin/productos/catalogo");
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar - visible en desktop */}
        <aside className="hidden md:flex md:flex-col md:gap-4 md:col-span-1 bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">Panel de Control</div>
            <button className="text-gray-500 text-xl" aria-hidden>⚙️</button>
          </div>

          <div className="mt-4 text-sm text-gray-500">Productos: <span className="font-bold text-gray-800">{productos.length}</span></div>

          <button
            onClick={openCatalogPage}
            className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded shadow-sm"
          >
            Generar Catálogo
          </button>

          <div className="mt-4 border-t pt-4">
            <div className="text-xs text-gray-500">Atajos</div>
            <ul className="mt-2 space-y-2">
              <li>
                <button onClick={() => router.push('/admin/productos/nuevo')} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-gray-100">Añadir Artículo</button>
              </li>
              <li>
                <button onClick={() => router.push('/admin/productos/editar')} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-gray-100">Editar Artículos</button>
              </li>
            </ul>
          </div>
        </aside>

        {/* Main content */}
        <main className="md:col-span-3">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Categorías</h1>
            {/* Mobile quick actions */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-sm text-gray-600">Total: <span className="font-semibold text-gray-800">{categorias.length}</span></div>
              <button onClick={openCatalogPage} className="bg-indigo-600 text-white px-3 py-2 rounded shadow-sm text-sm">Generar Catálogo</button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <form onSubmit={handleAgregar} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <input
                className="col-span-2 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Nueva categoría"
                value={nuevaCategoria}
                onChange={(e) => setNuevaCategoria(e.target.value)}
              />
              <button className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">Agregar</button>

              <div className="sm:col-span-3">
                <input
                  className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Buscar categoría..."
                  onChange={(e) => {
                    const q = e.target.value.toLowerCase();
                    // filtro simple client-side
                    if (!q) fetchCategorias();
                    else setCategorias((prev) => prev.filter(c => (c.categori||'').toLowerCase().includes(q)));
                  }}
                />
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categorias.length === 0 ? (
              <div className="col-span-full text-center text-gray-500 p-8 bg-white rounded shadow">No hay categorías. Añade la primera categoría para organizar tu catálogo.</div>
            ) : (
              categorias.map((cat) => {
                const count = productos.filter(p => p.categoria === cat.categori).length;
                return (
                  <div key={cat.id} className="bg-white rounded-lg shadow p-4 flex flex-col justify-between">
                    <div>
                      {editando === cat.id ? (
                        <div className="flex gap-2">
                          <input value={nombreEdit} onChange={(e) => setNombreEdit(e.target.value)} className="flex-1 border rounded px-3 py-2" />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-lg font-semibold text-gray-800">{cat.categori}</div>
                            <div className="text-xs text-gray-500">{count} producto{count !== 1 ? 's' : ''}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => { setEditando(cat.id); setNombreEdit(cat.categori); }} className="text-indigo-600 hover:text-indigo-800">Editar</button>
                            <button onClick={() => handleEliminar(cat.id)} className="text-red-600 hover:text-red-800">Eliminar</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {editando === cat.id && (
                      <div className="mt-4 flex items-center gap-2">
                        <button onClick={() => handleGuardarEdit(cat.id)} className="bg-blue-600 text-white px-3 py-2 rounded">Guardar</button>
                        <button onClick={() => setEditando(null)} className="border rounded px-3 py-2">Cancelar</button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
