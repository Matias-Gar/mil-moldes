"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import ConfirmModal from "@/components/ConfirmModal";
import ProductCard from "@/components/ProductCard";
import { Toast } from "@/components/ui/Toast";
import { showToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/SupabaseClient";
import { Input } from "@/components/ui/input";
import { validarProducto } from "@/lib/utils";
import { getProductViewMeta, normalizeProductView } from "@/lib/productViews";
import { useSucursalActiva } from "@/components/admin/SucursalContext";
import { optimizeImageForUpload } from "@/lib/imageUploadOptimization";

const BUCKET_NAME = "product_images";
const SUPABASE_PAGE_SIZE = 1000;

const isFileImage = (value) =>
  typeof File !== "undefined" && value instanceof File;

const getImageUrl = (image) => {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (isFileImage(image)) return "";
  return image.imagen_url || "";
};

const uploadProductImages = async (files) => {
  const uploadTasks = Array.from(files || []).map(async (file) => {
    if (!isFileImage(file)) return getImageUrl(file);

    const { file: preparedFile } = await optimizeImageForUpload(file);
    const safeName = preparedFile.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, preparedFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: preparedFile.type || "image/jpeg",
      });

    if (uploadError) {
      throw new Error(`Error al subir imagen a storage (Bucket: ${BUCKET_NAME}): ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  });

  return (await Promise.all(uploadTasks)).filter(
    (url) => typeof url === "string" && url.trim().length > 0 && url.startsWith("http")
  );
};

export default function EditarCatalogo() {
    const { activeSucursalId } = useSucursalActiva();
    const pathname = usePathname();
    const currentProductView = normalizeProductView(pathname?.includes('/admin/insumos') ? 'insumos' : 'articulos');
    const currentViewMeta = getProductViewMeta(currentProductView);
    // --- Lógica de edición de productos ---

    // Cargar productos, variantes, imágenes y categorías al montar
    useEffect(() => {
      const fetchData = async () => {
        setLoading(true);
        try {
          // Productos
          let productosQuery = supabase
            .from("productos")
            .select("*")
            .order("nombre", { ascending: true });
          if (activeSucursalId) productosQuery = productosQuery.eq("sucursal_id", activeSucursalId);
          const { data: productosData, error: productosError } = await productosQuery;
          if (productosError) throw productosError;

          const productIds = (productosData || [])
            .map((p) => p.user_id)
            .filter((id) => id !== undefined && id !== null);

          // Imágenes
          let imagenesData = [];
          if (productIds.length > 0) {
            let from = 0;
            while (true) {
              let imagenesQuery = supabase
                .from("producto_imagenes")
                .select("id, producto_id, imagen_url, sucursal_id")
                .in("producto_id", productIds);
              if (activeSucursalId) imagenesQuery = imagenesQuery.eq("sucursal_id", activeSucursalId);
              imagenesQuery = imagenesQuery
                .order("id", { ascending: true })
                .range(from, from + SUPABASE_PAGE_SIZE - 1);
              const { data, error: imagenesError } = await imagenesQuery;
              if (imagenesError) throw imagenesError;
              imagenesData = [...imagenesData, ...(data || [])];
              if (!data || data.length < SUPABASE_PAGE_SIZE) break;
              from += SUPABASE_PAGE_SIZE;
            }
          }

          // Variantes
          let variantesQuery = supabase
            .from("producto_variantes")
            .select("*");
          if (activeSucursalId) variantesQuery = variantesQuery.eq("sucursal_id", activeSucursalId);
          const { data: variantesData, error: variantesError } = await variantesQuery;
          if (variantesError) throw variantesError;

          // Categorías
          let categoriesQuery = supabase
            .from("categorias")
            .select("id, categori");
          if (activeSucursalId) categoriesQuery = categoriesQuery.eq("sucursal_id", activeSucursalId);
          const { data: categoriesData, error: categoriesError } = await categoriesQuery;
          if (categoriesError) throw categoriesError;

          // Asociar imágenes y variantes a cada producto
          const imgs = {};
          const vars = {};
          const imagesByProductId = (imagenesData || []).reduce((acc, img) => {
            const imageKey = String(img.producto_id);
            if (!acc[imageKey]) acc[imageKey] = [];
            acc[imageKey].push(img);
            return acc;
          }, {});
          (productosData || []).forEach((p) => {
            const key = getProductKey(p);
            const productImages = imagesByProductId[String(p.user_id)] || [];
            const baseImageUrl = String(p.imagen_url || "").trim();
            const hasBaseImageInGallery = productImages.some((img) => img.imagen_url === baseImageUrl);
            imgs[key] = baseImageUrl && baseImageUrl !== "/sin-imagen.png" && !hasBaseImageInGallery
              ? [{ id: `base-${p.user_id}`, producto_id: p.user_id, imagen_url: baseImageUrl, isBaseImage: true }, ...productImages]
              : productImages;
            vars[key] = (variantesData || []).filter(
              (v) => String(v.producto_id) === String(p.user_id)
            );
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
    }, [activeSucursalId]);
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
            variantes: [...current, { color: '', talla: '', stock: 0, stock_decimal: 0, sku: '' }],
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
      const nextFiles = Array.from(files || []);
      if (nextFiles.length === 0) return;
      setImagenes((prev) => {
        const nextImages = [...(prev[productKey] || []), ...nextFiles];
        setEditando((editPrev) => ({
          ...editPrev,
          [productKey]: {
            ...editPrev[productKey],
            imagenes: nextImages,
          },
        }));
        return { ...prev, [productKey]: nextImages };
      });
    };

    const handleRemoveImage = (productKey, idx) => {
      setImagenes((prev) => {
        const nextImages = (prev[productKey] || []).filter((_, i) => i !== idx);
        setEditando((editPrev) => ({
          ...editPrev,
          [productKey]: {
            ...editPrev[productKey],
            imagenes: nextImages,
          },
        }));
        return { ...prev, [productKey]: nextImages };
      });
    };

    const handleReplaceImage = (productKey, idx, file) => {
      if (!file) return;
      setImagenes((prev) => {
        const nextImages = [...(prev[productKey] || [])];
        nextImages[idx] = file;
        setEditando((editPrev) => ({
          ...editPrev,
          [productKey]: {
            ...editPrev[productKey],
            imagenes: nextImages,
          },
        }));
        return { ...prev, [productKey]: nextImages };
      });
    };

    const handleReorderImages = (productKey, fromIdx, toIdx) => {
      if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
      setImagenes((prev) => {
        const nextImages = [...(prev[productKey] || [])];
        if (!nextImages[fromIdx] || !nextImages[toIdx]) return prev;
        const [moved] = nextImages.splice(fromIdx, 1);
        nextImages.splice(toIdx, 0, moved);
        setEditando((editPrev) => ({
          ...editPrev,
          [productKey]: {
            ...editPrev[productKey],
            imagenes: nextImages,
          },
        }));
        return { ...prev, [productKey]: nextImages };
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
      const nuevasImagenesRaw = cambios.imagenes !== undefined ? cambios.imagenes : imagenes[prodId] || [];

      const errores = validarProducto({
        nombre: cambios.nombre ?? productoActual?.nombre,
        descripcion: cambios.descripcion ?? productoActual?.descripcion,
        variantes: nuevasVariantes,
        imagenes: nuevasImagenesRaw,
      });

      if (errores.length > 0) {
        showToast(errores.join("\n"), "error");
        setLoading(false);
        return;
      }


      // La edición general solo modifica datos descriptivos. El inventario y los
      // identificadores históricos se gestionan en flujos dedicados.
      const uploadedUrls = await uploadProductImages(nuevasImagenesRaw.filter(isFileImage));
      let uploadIndex = 0;
      const nuevasImagenes = nuevasImagenesRaw
        .map((img) => {
          if (isFileImage(img)) {
            const imagen_url = uploadedUrls[uploadIndex++];
            return imagen_url ? { imagen_url } : null;
          }
          const imagen_url = getImageUrl(img);
          return imagen_url ? { ...img, imagen_url } : null;
        })
        .filter(Boolean);
      // Determinar la imagen principal (primera del array de imágenes)
      const selectedPrimaryUrl = getImageUrl(
        nuevasImagenes.find((img) => String(img.id) === String(cambios.primaryImageId))
      ) || cambios.primaryImageUrl;
      const imagenPrincipal = nuevasImagenes.some((img) => getImageUrl(img) === selectedPrimaryUrl)
        ? selectedPrimaryUrl
        : getImageUrl(nuevasImagenes[0]);
      const updatePayload = {
        nombre: cambios.nombre ?? productoActual?.nombre,
        descripcion: cambios.descripcion ?? productoActual?.descripcion,
        precio: precioNormalizado,
        vista_producto: normalizeProductView(cambios.vista_producto ?? productoActual?.vista_producto),
        category_id: cambios.category_id
          ? parseInt(cambios.category_id, 10)
          : productoActual?.category_id ?? null,
        imagen_url: imagenPrincipal || null,
      };

      let updateQuery = supabase.from("productos").update(updatePayload);
      if (productoActual?.user_id !== undefined && productoActual?.user_id !== null) {
        updateQuery = updateQuery.eq("user_id", productoActual.user_id);
      } else {
        updateQuery = updateQuery.eq("id", prodId);
      }
      if (activeSucursalId) updateQuery = updateQuery.eq("sucursal_id", activeSucursalId);
      const { error: updateError } = await updateQuery;
      if (updateError) throw updateError;

      // 2. Sincronizar variantes
      // Obtener variantes actuales en BD
      const { data: variantesBD } = await supabase
        .from("producto_variantes")
        .select("id, producto_id, color, talla, stock, stock_decimal, sku, precio, imagen_url, activo").eq("producto_id", productoActual.user_id);
      // Eliminar variantes quitadas
      for (const vBD of variantesBD || []) {
        if (!nuevasVariantes.some(v => v.id === vBD.id)) {
          const stockActual = Number(vBD.stock_decimal ?? vBD.stock ?? 0);
          if (stockActual > 0) throw new Error(`No se puede eliminar la variante ${vBD.color || vBD.id}: aún tiene stock.`);
          await supabase.from("producto_variantes").update({ activo: false }).eq("id", vBD.id);
        }
      }
      // Insertar o actualizar variantes
      for (const v of nuevasVariantes) {
        if (v.id) {
          // Actualizar
          await supabase.from("producto_variantes").update({
            color: v.color,
            talla: v.talla,
            precio: parseDecimalInput(v.precio, null),
            imagen_url: v.imagen_url,
            activo: v.activo !== undefined ? v.activo : true,
          }).eq("id", v.id);
        } else {
          // Insertar
          await supabase.from("producto_variantes").insert({
            producto_id: productoActual.user_id,
            sucursal_id: activeSucursalId || null,
            color: v.color,
            talla: v.talla,
            stock: 0,
            stock_decimal: 0,
            stock_inicial: 0,
            stock_inicial_decimal: 0,
            sku: v.sku,
            precio: parseDecimalInput(v.precio, null),
            imagen_url: v.imagen_url,
            activo: v.activo !== undefined ? v.activo : true,
          });
        }
      }

      // 3. Sincronizar imágenes
      // Obtener imágenes actuales en BD
      let imagenesBDQuery = supabase
        .from("producto_imagenes")
        .select("id, producto_id, imagen_url").eq("producto_id", productoActual.user_id);
      if (activeSucursalId) imagenesBDQuery = imagenesBDQuery.eq("sucursal_id", activeSucursalId);
      const { data: imagenesBD } = await imagenesBDQuery;
      // Eliminar imágenes quitadas
      for (const imgBD of imagenesBD || []) {
        if (!nuevasImagenes.some(img => img.id === imgBD.id || img.imagen_url === imgBD.imagen_url)) {
          await supabase.from("producto_imagenes").delete().eq("id", imgBD.id);
        }
      }
      // Insertar nuevas imágenes
      for (const img of nuevasImagenes) {
        const alreadyExists = (imagenesBD || []).some((imgBD) => imgBD.imagen_url === img.imagen_url);
        if (!img.id && !alreadyExists) {
          await supabase.from("producto_imagenes").insert({
            producto_id: productoActual.user_id,
            sucursal_id: activeSucursalId || null,
            imagen_url: img.imagen_url,
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
