"use client";


import { useState, useEffect } from "react";
import { supabase } from "@/lib/SupabaseClient";
import Image from "next/image";

export default function PacksClient({ initialPacks = [] }) {

  const [editPack, setEditPack] = useState(null);
  const [productosAll, setProductosAll] = useState([]);

  // Cargar todos los productos para edición
  useEffect(() => {
    if (editPack) {
      supabase.from("productos").select("user_id, nombre, precio, stock").then(({ data }) => setProductosAll(data || []));
    }
  }, [editPack]);

  const [packs, setPacks] = useState(initialPacks);
  const [showForm, setShowForm] = useState(false);
  const [productos, setProductos] = useState([]);
  const [selected, setSelected] = useState([]); // [{producto_id, cantidad}]
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precioPack, setPrecioPack] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cargar productos solo cuando se abre el form
  const fetchProductos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("productos")
      .select("user_id, nombre, precio, stock");
    setProductos(data || []);
    setLoading(false);
    if (error) setError("Error al cargar productos");
  };

  const handleNuevoPack = () => {
    setShowForm(true);
    fetchProductos();
    setSelected([]);
    setNombre("");
    setDescripcion("");
    setPrecioPack("");
    setError("");
  };

  const handleSelectProduct = (producto_id, checked) => {
    if (checked) {
      setSelected(prev => [...prev, { producto_id, cantidad: 1 }]);
    } else {
      setSelected(prev => prev.filter(p => p.producto_id !== producto_id));
    }
  };

  const handleCantidadChange = (producto_id, cantidad) => {
    setSelected(prev => prev.map(p => p.producto_id === producto_id ? { ...p, cantidad: Math.max(1, Number(cantidad)) } : p));
  };

  const handleCrearPack = async (e) => {
    e.preventDefault();
    setError("");
    if (selected.length < 2) {
      setError("Selecciona al menos 2 productos");
      return;
    }
    if (!precioPack || isNaN(Number(precioPack)) || Number(precioPack) <= 0) {
      setError("Ingresa un precio válido para el pack");
      return;
    }
    setLoading(true);
    // Agrupar productos seleccionados por producto_id y sumar cantidad
    const agrupados = {};
    for (const sel of selected) {
      const key = String(sel.producto_id);
      if (!agrupados[key]) {
        const prod = productos.find(p => String(p.user_id) === key);
        if (prod) agrupados[key] = { ...prod, cantidad: 0 };
      }
      if (agrupados[key]) agrupados[key].cantidad += Number(sel.cantidad || 1);
    }
    const productosSeleccionados = Object.values(agrupados);
    if (productosSeleccionados.length < 2) {
      setError("Productos inválidos");
      setLoading(false);
      return;
    }
    // Crear pack
    const { data: nuevoPack, error: errorPack } = await supabase
      .from("packs")
      .insert([
        {
          nombre: nombre || `Pack Especial: ${productosSeleccionados.map(p => p.nombre).join(' + ')}`,
          descripcion: descripcion || `Llévate ${productosSeleccionados.length} productos por un solo precio!`,
          precio_pack: Number(precioPack),
          activo: true
        }
      ])
      .select();
    if (errorPack || !nuevoPack || !nuevoPack[0]) {
      setError("Error al crear pack");
      setLoading(false);
      return;
    }
    const packId = nuevoPack[0].id;
    // Insertar productos en pack_productos
    const packProductos = productosSeleccionados.map(p => ({ pack_id: packId, producto_id: p.user_id, cantidad: p.cantidad }));
    const { error: errorPP } = await supabase
      .from("pack_productos")
      .insert(packProductos);
    if (errorPP) {
      setError("Error al asociar productos al pack");
      setLoading(false);
      return;
    }
    // Refrescar packs
    const { data: nuevosPacks } = await supabase
      .from("packs")
      .select("*")
      .order("id", { ascending: true });
    setPacks(nuevosPacks || []);
    setShowForm(false);
    setSelected([]);
    setNombre(""); setDescripcion(""); setPrecioPack("");
    setLoading(false);
  };

  return (
    <section>
      <button
        className="mb-4 px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800 font-bold shadow-lg"
        onClick={handleNuevoPack}
      >
        + Nuevo Pack Especial
      </button>
      {showForm && (
        <form
          className="bg-white rounded-2xl shadow-xl p-8 max-w-xl mx-auto mb-8 border border-gray-200"
          onSubmit={handleCrearPack}
        >
          <h2 className="text-2xl font-bold mb-6 text-gray-900 text-center">Crear Pack Especial</h2>
          <div className="mb-6">
            <label className="block mb-2 font-semibold text-gray-800 text-base">Selecciona productos <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-52 overflow-y-auto bg-gray-50 rounded-lg p-3 border border-gray-200">
              {productos.map(p => {
                const checked = selected.some(sel => sel.producto_id === p.user_id);
                const cantidad = selected.find(sel => sel.producto_id === p.user_id)?.cantidad || 1;
                return (
                  <div key={p.user_id} className={`flex items-center gap-3 p-2 rounded-lg ${checked ? 'bg-blue-50 border border-blue-200' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => handleSelectProduct(p.user_id, e.target.checked)}
                      className="w-5 h-5 accent-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-400"
                    />
                    <span className="font-medium text-gray-900">{p.nombre}</span>
                    <span className="text-xs text-gray-500">(Bs {p.precio})</span>
                    {checked && (
                      <input
                        type="number"
                        min={1}
                        max={p.stock}
                        value={cantidad}
                        onChange={e => handleCantidadChange(p.user_id, e.target.value)}
                        className="ml-2 w-16 rounded border border-gray-300 p-1 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        title="Cantidad"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mb-5">
            <label className="block mb-1 font-semibold text-gray-800">Precio total del pack <span className="text-red-500">*</span></label>
            <input
              className="w-full p-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={precioPack}
              onChange={e => setPrecioPack(e.target.value)}
              placeholder="Ej: 100"
              type="number"
              min={1}
              required
            />
          </div>
          <div className="mb-5">
            <label className="block mb-1 font-semibold text-gray-800">Nombre del Pack (opcional)</label>
            <input
              className="w-full p-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Pack Especial: Producto A + Producto B"
            />
          </div>
          <div className="mb-5">
            <label className="block mb-1 font-semibold text-gray-800">Descripción (opcional)</label>
            <input
              className="w-full p-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Llévate varios productos por un solo precio."
            />
          </div>
          {error && <div className="text-red-600 mb-4 font-semibold">{error}</div>}
          <div className="flex gap-3 justify-center mt-6">
            <button
              type="submit"
              className="px-7 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold shadow focus:outline-none focus:ring-2 focus:ring-green-400 transition"
              disabled={loading}
            >
              Crear Pack
            </button>
            <button
              type="button"
              className="px-7 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-bold shadow focus:outline-none focus:ring-2 focus:ring-gray-400 transition"
              onClick={() => setShowForm(false)}
              disabled={loading}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {packs.map((p) => {
          // Collage de imágenes de productos del pack
          // Collage de imágenes: solo usar imagen del producto principal, nunca de variante
          const collageImgs = Array.isArray(p.pack_productos)
            ? p.pack_productos.map(item => {
                // Siempre usar la imagen del producto, nunca de variante
                return item.productos?.imagen_url || null;
              }).filter(Boolean).slice(0, 4)
            : [];
          return (
            <div key={p.id} className="bg-gradient-to-br from-purple-200 to-purple-100 border-2 border-purple-400 rounded-xl p-5 shadow-lg flex flex-col items-start hover:scale-105 transition-transform duration-200">
              <div className="flex items-center gap-2 mb-2 w-full justify-between">
                <div className="flex items-center gap-2">
                  {p.imagen_url ? (
                    <Image src={p.imagen_url} alt={p.nombre} width={48} height={48} className="rounded border border-purple-400 bg-white" />
                  ) : collageImgs.length > 0 ? (
                    <div className="grid grid-cols-2 grid-rows-2 w-12 h-12 rounded overflow-hidden border border-purple-400 bg-white">
                      {collageImgs.map((img, idx) => (
                        <Image key={idx} src={img} alt={p.nombre + ' img ' + idx} width={24} height={24} className="object-cover w-full h-full" />
                      ))}
                    </div>
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center bg-purple-100 border border-purple-400 rounded">
                      <span className="text-2xl">🎁</span>
                    </div>
                  )}
                  <span className="font-extrabold text-purple-900 text-lg drop-shadow-sm">{p.nombre || p.title || `Pack ${p.id}`}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-2 py-1 rounded font-bold text-xs shadow"
                    title="Editar pack"
                    onClick={() => setEditPack(p)}
                  >✏️ Editar</button>
                  <button
                    className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded font-bold text-xs shadow"
                    title="Eliminar pack"
                    onClick={async () => {
                      if (window.confirm(`¿Seguro que deseas eliminar el pack "${p.nombre}"?`)) {
                        const { error } = await supabase.from('packs').delete().eq('id', p.id);
                        if (!error) {
                          setPacks(packs.filter(pk => pk.id !== p.id));
                        } else {
                          alert('Error al eliminar el pack: ' + error.message);
                        }
                      }
                    }}
                  >🗑️ Eliminar</button>
                </div>
              </div>
              <div className="text-purple-700 mb-2 text-sm font-semibold">{p.descripcion}</div>
              <div className="mb-2 text-xs text-purple-800 font-bold">Incluye:</div>
              <ul className="mb-2 ml-2 text-sm text-purple-900 list-disc">
                {Array.isArray(p.pack_productos) && p.pack_productos.map((item, idx) => (
                  <li key={idx}>{item.cantidad}x {item.productos?.nombre || 'Producto'}</li>
                ))}
              </ul>
              <div className="mt-auto flex items-center gap-2">
                <span className="text-lg font-extrabold text-green-700">Bs {p.precio_pack}</span>
                <span className="bg-purple-600 text-white px-2 py-1 rounded-full text-xs font-bold">Pack</span>
              </div>
            </div>
          );
        })}
          {/* MODAL DE EDICIÓN DE PACK */}
          {editPack && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditPack(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-4 text-purple-900">Editar Pack</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target;
                    const nombre = form.nombre.value.trim();
                    const descripcion = form.descripcion.value.trim();
                    let imagen_url = editPack.imagen_url;
                    // Subida de imagen si hay archivo nuevo
                    const file = form.imagen.files[0];
                    if (file) {
                      const filePath = `packs/${editPack.id}_${Date.now()}_${file.name}`;
                      const { error: uploadError } = await supabase.storage.from('public').upload(filePath, file, { upsert: true });
                      if (!uploadError) {
                        const { data } = supabase.storage.from('public').getPublicUrl(filePath);
                        imagen_url = data.publicUrl;
                      } else {
                        alert('Error subiendo imagen: ' + uploadError.message);
                        return;
                      }
                    }
                    // Productos seleccionados y cantidades
                    const productosSeleccionados = productosAll.filter(p => form[`prod_${p.user_id}`]?.checked)
                      .map(p => ({
                        producto_id: p.user_id,
                        cantidad: Math.max(1, Number(form[`cant_${p.user_id}`]?.value || 1))
                      }));
                    if (productosSeleccionados.length < 2) {
                      alert('Selecciona al menos 2 productos para el pack');
                      return;
                    }
                    // Actualizar pack en la base de datos
                    const { error } = await supabase.from('packs').update({ nombre, descripcion, imagen_url }).eq('id', editPack.id);
                    if (error) {
                      alert('Error al actualizar pack: ' + error.message);
                      return;
                    }
                    // Actualizar productos del pack: eliminar todos y volver a insertar
                    await supabase.from('pack_productos').delete().eq('pack_id', editPack.id);
                    const nuevosPackProductos = productosSeleccionados.map(p => ({ pack_id: editPack.id, producto_id: p.producto_id, cantidad: p.cantidad }));
                    if (nuevosPackProductos.length > 0) {
                      await supabase.from('pack_productos').insert(nuevosPackProductos);
                    }
                    // Refrescar packs
                    const { data: nuevosPacks } = await supabase.from('packs').select('*').order('id', { ascending: true });
                    setPacks(nuevosPacks || []);
                    setEditPack(null);
                  }}
                >
                  <div className="mb-4">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del pack</label>
                    <input name="nombre" defaultValue={editPack.nombre} className="w-full border border-purple-300 rounded px-3 py-2" required />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Descripción</label>
                    <input name="descripcion" defaultValue={editPack.descripcion} className="w-full border border-purple-300 rounded px-3 py-2" />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Imagen del pack</label>
                    {editPack.imagen_url && (
                      <Image src={editPack.imagen_url} alt="Imagen actual del pack" width={96} height={96} className="w-24 h-24 object-cover rounded mb-2 border" />
                    )}
                    <input name="imagen" type="file" accept="image/*" className="w-full" />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Productos del pack</label>
                    <div className="max-h-40 overflow-y-auto border rounded p-2 bg-purple-50">
                      {productosAll.map(prod => {
                        const checked = Array.isArray(editPack.pack_productos) && editPack.pack_productos.some(pp => pp.producto_id === prod.user_id);
                        const cantidad = Array.isArray(editPack.pack_productos) && editPack.pack_productos.find(pp => pp.producto_id === prod.user_id)?.cantidad || 1;
                        return (
                          <div key={prod.user_id} className="flex items-center gap-2 mb-1">
                            <input
                              type="checkbox"
                              name={`prod_${prod.user_id}`}
                              defaultChecked={checked}
                            />
                            <span className="font-semibold text-purple-900">{prod.nombre}</span>
                            <span className="text-xs text-gray-500">(Bs {prod.precio})</span>
                            <input
                              type="number"
                              name={`cant_${prod.user_id}`}
                              min={1}
                              max={prod.stock}
                              defaultValue={cantidad}
                              className="w-14 ml-2 rounded p-1 border"
                              title="Cantidad"
                              disabled={!checked}
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end mt-6">
                    <button type="button" onClick={() => setEditPack(null)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium">Cancelar</button>
                    <button type="submit" className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold">Guardar cambios</button>
                  </div>
                </form>
              </div>
            </div>
          )}
      </div>
    </section>
  );
}
