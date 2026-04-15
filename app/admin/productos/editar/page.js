"use client";

import { useEffect, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";
import ProductCard from "@/components/ProductCard";
import { Toast } from "@/components/ui/Toast";
import { showToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/SupabaseClient";
import { Input } from "@/components/ui/input";
import { registrarMovimientoStock } from "@/lib/stockMovimientos";
import { registrarHistorialProducto } from "@/lib/productosHistorial";
import { sincronizarStockProducto, validarProducto } from "@/lib/utils";

export default function EditarCatalogo() {
    // --- Lógica de edición de productos ---

    // Cargar productos, variantes, imágenes y categorías al montar
    useEffect(() => {
      const fetchData = async () => {
        setLoading(true);
        try {
          // Productos
          const { data: productosData, error: productosError } = await supabase
            .from("productos")
            .select("*")
            .order("nombre", { ascending: true });
          if (productosError) throw productosError;

          // Imágenes
          const { data: imagenesData, error: imagenesError } = await supabase
            .from("producto_imagenes")
            .select("id, producto_id, imagen_url");
          if (imagenesError) throw imagenesError;

          // Variantes
          const { data: variantesData, error: variantesError } = await supabase
            .from("producto_variantes")
            .select("*");
          if (variantesError) throw variantesError;

          // Categorías
          const { data: categoriesData, error: categoriesError } = await supabase
            .from("categorias")
            .select("id, categori");
          if (categoriesError) throw categoriesError;

          // Asociar imágenes y variantes a cada producto
          const imgs = {};
          const vars = {};
          (productosData || []).forEach((p) => {
            const key = getProductKey(p);
            imgs[key] = (imagenesData || []).filter(img => img.producto_id === p.user_id);
            vars[key] = (variantesData || []).filter(v => v.producto_id === p.user_id);
          });

          setProductos(productosData || []);
          setImagenes(imgs);
          setVariantes(vars);
          setCategories(categoriesData || []);
        } catch (err) {
          showToast("Error cargando productos: " + (err?.message || err), "error");
        }
        setLoading(false);
      };
      fetchData();
    }, []);
    // Manejo de cambios en campos del producto
    const setEditDataField = (productKey, field, value) => {
      setEditando((prev) => ({
        ...prev,
        [productKey]: {
          ...prev[productKey],
          [field]: value,
        },
      }));
    };

    // Variantes
    const handleAddVariantRow = (productKey) => {
      setEditando((prev) => {
        const current = prev[productKey]?.variantes || variantes[productKey] || [];
        return {
          ...prev,
          [productKey]: {
            ...prev[productKey],
            variantes: [...current, { color: '', talla: '', stock: 0 }],
          },
        };
      });
    };

    const handleVariantFieldChange = (productKey, idx, field, value) => {
      setEditando((prev) => {
        const current = prev[productKey]?.variantes || variantes[productKey] || [];
        const updated = current.map((v, i) =>
          i === idx ? { ...v, [field]: value } : v
        );
        return {
          ...prev,
          [productKey]: {
            ...prev[productKey],
            variantes: updated,
          },
        };
      });
    };

    const handleRemoveVariantRow = (productKey, idx) => {
      setEditando((prev) => {
        const current = prev[productKey]?.variantes || variantes[productKey] || [];
        const updated = current.filter((_, i) => i !== idx);
        return {
          ...prev,
          [productKey]: {
            ...prev[productKey],
            variantes: updated,
          },
        };
      });
    };

    // Imágenes
    const handleAddImages = (productKey, files) => {
      setImagenes((prev) => ({
        ...prev,
        [productKey]: [...(prev[productKey] || []), ...files],
      }));
      setEditando((prev) => ({
        ...prev,
        [productKey]: {
          ...prev[productKey],
          imagenes: [...((prev[productKey]?.imagenes) || []), ...files],
        },
      }));
    };

    const handleRemoveImage = (productKey, idx) => {
      setImagenes((prev) => ({
        ...prev,
        [productKey]: (prev[productKey] || []).filter((_, i) => i !== idx),
      }));
      setEditando((prev) => ({
        ...prev,
        [productKey]: {
          ...prev[productKey],
          imagenes: (prev[productKey]?.imagenes || []).filter((_, i) => i !== idx),
        },
      }));
    };

    const handleReplaceImage = (productKey, idx, file) => {
      setImagenes((prev) => {
        const arr = [...(prev[productKey] || [])];
        arr[idx] = file;
        return { ...prev, [productKey]: arr };
      });
      setEditando((prev) => {
        const arr = [...((prev[productKey]?.imagenes) || [])];
        arr[idx] = file;
        return {
          ...prev,
          [productKey]: {
            ...prev[productKey],
            imagenes: arr,
          },
        };
      });
    };

    const handleReorderImages = (productKey, fromIdx, toIdx) => {
      setImagenes((prev) => {
        const arr = [...(prev[productKey] || [])];
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        return { ...prev, [productKey]: arr };
      });
      setEditando((prev) => {
        const arr = [...((prev[productKey]?.imagenes) || [])];
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        return {
          ...prev,
          [productKey]: {
            ...prev[productKey],
            imagenes: arr,
          },
        };
      });
    };

    // Confirmación
    const openConfirm = (productKey) => {
      setModalConfirm({ visible: true, id: productKey });
    };
    const closeConfirm = () => {
      setModalConfirm({ visible: false, id: null });
    };
  const [productos, setProductos] = useState([]);
  const [imagenes, setImagenes] = useState({});
  const [variantes, setVariantes] = useState({});
  const [categories, setCategories] = useState([]);
  const [editando, setEditando] = useState({});
  const [modalConfirm, setModalConfirm] = useState({ visible: false, id: null });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortOrder, setSortOrder] = useState("alphabetical");

  const getProductKey = (product) => product?.id ?? product?.user_id ?? null;

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setSortOrder("alphabetical");
  };

  const parseDecimalInput = (value, fallback = null) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    const normalized = String(value).replace(/\s/g, "").replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const handleConfirmSave = async () => {
    const prodId = modalConfirm.id;
    if (!prodId) return;

    setLoading(true);

    try {
      const cambios = editando[prodId] || {};
      const productoActual = productos.find((p) => getProductKey(p) === prodId);
      const precioNormalizado = parseDecimalInput(
        cambios.precio,
        parseDecimalInput(productoActual?.precio, 0)
      );

      // Variantes e imágenes editadas
      const nuevasVariantes = cambios.variantes !== undefined ? cambios.variantes : variantes[prodId] || [];
      const nuevasImagenes = cambios.imagenes !== undefined ? cambios.imagenes : imagenes[prodId] || [];

      const errores = validarProducto({
        nombre: cambios.nombre ?? productoActual?.nombre,
        descripcion: cambios.descripcion ?? productoActual?.descripcion,
        variantes: nuevasVariantes,
        imagenes: nuevasImagenes,
      });

      if (errores.length > 0) {
        showToast(errores.join("\n"), "error");
        setLoading(false);
        return;
      }


      // 1. Actualizar producto (campos básicos, stock e imagen principal)
      const stockTotal = nuevasVariantes.reduce((acc, v) => acc + (parseInt(v.stock, 10) || 0), 0);
      // Determinar la imagen principal (primera del array de imágenes)
      let imagenPrincipal = null;
      if (nuevasImagenes.length > 0) {
        const img = nuevasImagenes[0];
        imagenPrincipal = img.imagen_url || img;
      }
      const updatePayload = {
        nombre: cambios.nombre ?? productoActual?.nombre,
        descripcion: cambios.descripcion ?? productoActual?.descripcion,
        precio: precioNormalizado,
        category_id: cambios.category_id
          ? parseInt(cambios.category_id, 10)
          : productoActual?.category_id ?? null,
        codigo_barra: cambios.codigo_barra ?? productoActual?.codigo_barra,
        stock: stockTotal,
        imagen_url: imagenPrincipal || productoActual?.imagen_url || '/sin-imagen.png',
      };

      let updateQuery = supabase.from("productos").update(updatePayload);
      if (productoActual?.user_id !== undefined && productoActual?.user_id !== null) {
        updateQuery = updateQuery.eq("user_id", productoActual.user_id);
      } else {
        updateQuery = updateQuery.eq("id", prodId);
      }
      const { error: updateError } = await updateQuery;
      if (updateError) throw updateError;

      // 2. Sincronizar variantes
      // Obtener variantes actuales en BD
      const { data: variantesBD } = await supabase
        .from("producto_variantes")
        .select("id, producto_id, color, talla, stock, sku, precio, imagen_url, activo").eq("producto_id", productoActual.user_id);
      // Eliminar variantes quitadas
      for (const vBD of variantesBD || []) {
        if (!nuevasVariantes.some(v => v.id === vBD.id)) {
          await supabase.from("producto_variantes").delete().eq("id", vBD.id);
        }
      }
      // Insertar o actualizar variantes
      for (const v of nuevasVariantes) {
        if (v.id) {
          // Actualizar
          await supabase.from("producto_variantes").update({
            color: v.color,
            talla: v.talla,
            stock: parseInt(v.stock, 10) || 0,
            sku: v.sku,
            precio: parseDecimalInput(v.precio, null),
            imagen_url: v.imagen_url,
            activo: v.activo !== undefined ? v.activo : true,
          }).eq("id", v.id);
        } else {
          // Insertar
          await supabase.from("producto_variantes").insert({
            producto_id: productoActual.user_id,
            color: v.color,
            talla: v.talla,
            stock: parseInt(v.stock, 10) || 0,
            sku: v.sku,
            precio: parseDecimalInput(v.precio, null),
            imagen_url: v.imagen_url,
            activo: v.activo !== undefined ? v.activo : true,
          });
        }
      }

      // 3. Sincronizar imágenes
      // Obtener imágenes actuales en BD
      const { data: imagenesBD } = await supabase
        .from("producto_imagenes")
        .select("id, producto_id, imagen_url").eq("producto_id", productoActual.user_id);
      // Eliminar imágenes quitadas
      for (const imgBD of imagenesBD || []) {
        if (!nuevasImagenes.some(img => img.id === imgBD.id || img.imagen_url === imgBD.imagen_url)) {
          await supabase.from("producto_imagenes").delete().eq("id", imgBD.id);
        }
      }
      // Insertar nuevas imágenes
      for (const img of nuevasImagenes) {
        if (!img.id) {
          await supabase.from("producto_imagenes").insert({
            producto_id: productoActual.user_id,
            imagen_url: img.imagen_url || img,
          });
        }
      }

      showToast("Producto actualizado con éxito!");

      if (typeof window !== "undefined") {
        setTimeout(() => {
          window.location.reload();
        }, 900);
      }

      setEditando((prev) => ({ ...prev, [prodId]: undefined }));
    } catch (err) {
      const msg = err?.message || "Error guardando producto";
      showToast("Error guardando producto: " + msg, "error");
      console.error("Error guardando producto:", err);
    }

    setLoading(false);
    closeConfirm();
  };

  const filteredAndSortedProducts = () => {
    let list = [...productos];

    const normalizedSearch = String(search || "").trim().toLowerCase();
    if (normalizedSearch) {
      list = list.filter((p) => {
        const productKey = getProductKey(p);
        const productVariants = editando[productKey]?.variantes ?? variantes[productKey] ?? [];
        const colorsText = productVariants.map((v) => String(v?.color || "")).join(" ").toLowerCase();
        const nombre = String(p?.nombre || "").toLowerCase();
        const categoria = String(p?.categoria || "").toLowerCase();
        const descripcion = String(p?.descripcion || "").toLowerCase();
        const codigoBarra = String(p?.codigo_barra || "").toLowerCase();
        return (
          nombre.includes(normalizedSearch) ||
          categoria.includes(normalizedSearch) ||
          descripcion.includes(normalizedSearch) ||
          codigoBarra.includes(normalizedSearch) ||
          colorsText.includes(normalizedSearch)
        );
      });
    }

    if (categoryFilter) {
      const selectedCategory = String(categoryFilter);
      list = list.filter((p) => String(p?.category_id ?? "") === selectedCategory);
    }

    if (sortOrder === "alphabetical") {
      list = list.sort((a, b) => String(a?.nombre || "").localeCompare(String(b?.nombre || "")));
    } else {
      list = list.sort(
        (a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0)
      );
    }
    return list;
  };

  const selectedProduct = productos.find(
    (p) => getProductKey(p) === modalConfirm.id
  );

  return (
    <div className="p-6 max-w-screen-xl mx-auto bg-slate-50 min-h-screen">
      <h1 className="text-4xl text-center font-bold text-indigo-700 mb-8">
        Editar Artículos
      </h1>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 md:p-5 mb-8 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, color, código o categoría"
            className="w-full"
          />

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full border-slate-300 rounded-lg p-3 bg-white"
          >
            <option value="">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.categori}
              </option>
            ))}
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-full border-slate-300 rounded-lg p-3 bg-white"
          >
            <option value="alphabetical">Orden alfabético</option>
            <option value="date">Más recientes primero</option>
          </select>

          <button
            type="button"
            onClick={clearFilters}
            className="w-full px-4 py-3 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition"
          >
            Limpiar filtros
          </button>
        </div>

        <div className="flex items-center justify-start">
          <div className="text-sm text-slate-600">
            Mostrando <span className="font-semibold text-slate-900">{filteredAndSortedProducts().length}</span> de <span className="font-semibold text-slate-900">{productos.length}</span> productos
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center text-gray-600 mb-4">Cargando...</div>
      )}

      {/* LISTA DE PRODUCTOS */}
      <div className="space-y-8">
        {filteredAndSortedProducts().map((prod) => {
          const productKey = getProductKey(prod);
          return (
          <ProductCard
            key={productKey}
            prod={prod}
            categories={categories}
            editData={{
              originalImages: imagenes[productKey],
              originalVariants: variantes[productKey] || [],
              ...editando[productKey],
            }}
            setEditDataField={setEditDataField}
            onAddVariantRow={handleAddVariantRow}
            onVariantFieldChange={handleVariantFieldChange}
            onRemoveVariantRow={handleRemoveVariantRow}
            handleAddImages={handleAddImages}
            handleRemoveImage={handleRemoveImage}
            handleReplaceImage={handleReplaceImage}
            handleReorderImages={handleReorderImages}
            openConfirm={openConfirm}
          />
        )})}
      </div>

      {/* MODAL CONFIRM */}
      <ConfirmModal
        visible={modalConfirm.visible}
        onCancel={closeConfirm}
        onConfirm={handleConfirmSave}
        title="Guardar cambios del producto"
        message="Se detectaron cambios pendientes en este producto."
        detail={selectedProduct ? ("Producto: " + selectedProduct.nombre) : "Verifica la informacion antes de confirmar."}
        confirmLabel="Si, guardar"
        cancelLabel="Volver"
      />

      <Toast />
    </div>
  );
}
