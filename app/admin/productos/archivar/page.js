"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../../lib/SupabaseClient";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { registrarHistorialProducto } from "../../../../lib/productosHistorial";
import { getOptimizedImageUrl, buildImageSrcSet } from "../../../../lib/imageOptimization";
import { useSucursalActiva } from "../../../../components/admin/SucursalContext";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function ArchivarProductosPage() {
  const { activeSucursalId } = useSucursalActiva();
  const [productos, setProductos] = useState([]);
  const [imagenes, setImagenes] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [message, setMessage] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [estado, setEstado] = useState("activos");
  const [orden, setOrden] = useState("recientes");
  const inputRef = useRef(null);

  useEffect(() => {
    async function fetchProductos() {
      setMessage("");
      let query = supabase
        .from("productos")
        .select("user_id, nombre, precio, stock, categoria, codigo_barra, created_at, archivado")
        .order("created_at", { ascending: false });

      if (activeSucursalId) query = query.eq("sucursal_id", activeSucursalId);

      const { data, error } = await query;
      if (error) {
        setMessage(`No se pudieron cargar productos: ${error.message}`);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      setProductos(rows);

      const ids = rows.map((p) => p.user_id).filter(Boolean);
      if (ids.length === 0) {
        setImagenes({});
        return;
      }

      let imgsQuery = supabase
        .from("producto_imagenes")
        .select("producto_id, imagen_url")
        .in("producto_id", ids);
      if (activeSucursalId) imgsQuery = imgsQuery.eq("sucursal_id", activeSucursalId);

      const { data: imgs } = await imgsQuery;
      const agrupadas = {};
      (Array.isArray(imgs) ? imgs : []).forEach((img) => {
        if (!agrupadas[img.producto_id]) agrupadas[img.producto_id] = [];
        if (img.imagen_url) agrupadas[img.producto_id].push(img.imagen_url);
      });
      setImagenes(agrupadas);
    }

    fetchProductos();
  }, [activeSucursalId, savingId]);

  const categoriasDisponibles = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [productos]
  );

  const productosFiltrados = useMemo(() => {
    const term = normalizeText(busqueda);
    const filtered = productos.filter((p) => {
      const archived = Boolean(p.archivado);
      const matchesEstado =
        estado === "todos" ||
        (estado === "archivados" ? archived : !archived);
      const matchesCategoria = !categoria || p.categoria === categoria;
      const matchesSearch =
        !term ||
        normalizeText(p.nombre).includes(term) ||
        normalizeText(p.categoria).includes(term) ||
        String(p.user_id || "").includes(term) ||
        String(p.codigo_barra || "").includes(term);

      return matchesEstado && matchesCategoria && matchesSearch;
    });

    return filtered.sort((a, b) => {
      if (orden === "alfabetico") return String(a.nombre || "").localeCompare(String(b.nombre || ""), "es");
      if (orden === "stock") return Number(b.stock || 0) - Number(a.stock || 0);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [busqueda, categoria, estado, orden, productos]);

  const toggleArchivado = async (producto) => {
    const nextArchived = !Boolean(producto.archivado);
    const actionText = nextArchived ? "archivar" : "desarchivar";
    const confirmed = window.confirm(
      nextArchived
        ? `Archivar "${producto.nombre}"? Ya no aparecera en catalogo, pedidos ni busquedas de venta.`
        : `Desarchivar "${producto.nombre}"? Volvera a aparecer en catalogo y ventas.`
    );
    if (!confirmed) return;

    setSavingId(producto.user_id);
    setMessage("");

    try {
      const user = (await supabase.auth.getUser())?.data?.user;
      let updateQuery = supabase
        .from("productos")
        .update({
          archivado: nextArchived,
          archivado_at: nextArchived ? new Date().toISOString() : null,
          archivado_por: nextArchived ? user?.id || null : null,
        })
        .eq("user_id", producto.user_id);

      if (activeSucursalId) updateQuery = updateQuery.eq("sucursal_id", activeSucursalId);

      const { error } = await updateQuery;
      if (error) throw error;

      await registrarHistorialProducto({
        producto_id: Number(producto.user_id),
        accion: nextArchived ? "ARCHIVE" : "UNARCHIVE",
        datos_anteriores: producto,
        datos_nuevos: { ...producto, archivado: nextArchived },
        usuario_email: user?.email || null,
        sucursal_id: activeSucursalId || null,
      });

      setProductos((prev) =>
        prev.map((p) =>
          p.user_id === producto.user_id
            ? { ...p, archivado: nextArchived, archivado_at: nextArchived ? new Date().toISOString() : null }
            : p
        )
      );
      setMessage(nextArchived ? "Producto archivado correctamente." : "Producto desarchivado correctamente.");
    } catch (err) {
      setMessage(`No se pudo ${actionText}: ${err.message || err}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Archivar Productos</h1>
        <p className="mt-1 text-sm text-gray-600">
          Oculta productos sin borrar ventas, historial ni movimientos. Puedes desarchivarlos cuando quieras.
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800">
          {message}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          className="w-full max-w-xs rounded border px-3 py-2 text-gray-900 placeholder-gray-600"
          placeholder="Buscar por nombre, ID, codigo o categoria..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select className="rounded border px-3 py-2 text-gray-900" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="activos">Activos</option>
          <option value="archivados">Archivados</option>
          <option value="todos">Todos</option>
        </select>
        <select className="rounded border px-3 py-2 text-gray-900" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas las categorias</option>
          {categoriasDisponibles.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <select className="rounded border px-3 py-2 text-gray-900" value={orden} onChange={(e) => setOrden(e.target.value)}>
          <option value="recientes">Mas recientes primero</option>
          <option value="alfabetico">A-Z</option>
          <option value="stock">Mayor stock</option>
        </select>
        <button
          type="button"
          className="rounded bg-gray-200 px-3 py-2 text-gray-700 hover:bg-gray-300"
          onClick={() => {
            setBusqueda("");
            setCategoria("");
            setEstado("activos");
            setOrden("recientes");
            inputRef.current?.focus();
          }}
        >
          Limpiar filtros
        </button>
      </div>

      <div className="mb-3 text-sm font-semibold text-gray-700">
        Mostrando {productosFiltrados.length} producto(s)
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
        {productosFiltrados.length === 0 ? (
          <div className="col-span-full text-gray-700">No hay productos para mostrar.</div>
        ) : (
          productosFiltrados.map((prod) => {
            const isArchived = Boolean(prod.archivado);
            const img = imagenes[prod.user_id]?.[0];
            return (
              <Card key={prod.user_id} className={isArchived ? "border-gray-400 bg-gray-50" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-gray-900">{prod.nombre}</CardTitle>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${isArchived ? "bg-gray-800 text-white" : "bg-green-100 text-green-800"}`}>
                      {isArchived ? "Archivado" : "Activo"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center gap-2">
                    {img ? (
                      <img
                        src={getOptimizedImageUrl(img, 280)}
                        srcSet={buildImageSrcSet(img, [140, 280, 560], { quality: 95, format: "origin" })}
                        sizes="112px"
                        loading="lazy"
                        decoding="async"
                        alt={prod.nombre}
                        className={`h-28 w-28 rounded-lg border object-cover shadow ${isArchived ? "grayscale" : ""}`}
                      />
                    ) : (
                      <span className="text-gray-400">Sin imagen</span>
                    )}
                    <div className="mt-2 text-sm font-semibold text-gray-900">Precio: Bs {Number(prod.precio || 0).toFixed(2)}</div>
                    <div className="text-gray-900">Stock: <span className={Number(prod.stock || 0) < 3 ? "font-bold text-red-600" : ""}>{prod.stock || 0}</span></div>
                    <div className="text-gray-900">Categoria: {prod.categoria || "-"}</div>
                    {prod.codigo_barra && <div className="text-xs text-gray-500">Codigo: {prod.codigo_barra}</div>}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    onClick={() => toggleArchivado(prod)}
                    className={`w-full font-bold text-white ${isArchived ? "bg-green-700 hover:bg-green-800" : "bg-gray-900 hover:bg-gray-800"}`}
                    disabled={savingId === prod.user_id}
                  >
                    {savingId === prod.user_id ? "Guardando..." : isArchived ? "Desarchivar" : "Archivar"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
