import ImageManager from "@/components/ImageManager";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getOptimizedImageUrl, buildImageSrcSet } from "@/lib/imageOptimization";

export default function ProductCard({
  prod,
  categories,
  editData,
  setEditDataField,
  onAddVariantRow,
  onVariantFieldChange,
  onRemoveVariantRow,
  handleAddImages,
  handleRemoveImage,
  handleReplaceImage,
  handleReorderImages,
  openConfirm,
}) {
  const productId = prod?.id ?? prod?.user_id;
  const imagesArr = editData.reordered ?? editData.originalImages ?? [];
  const variantsArr = editData.variantes ?? editData.originalVariants ?? [];
  const totalStockFromVariants = variantsArr.reduce(
    (sum, v) => sum + (parseInt(v?.stock ?? 0) || 0),
    0
  );
  // Siempre usar la imagen del producto, nunca de variante
  const imageFromProducto = imagesArr.find(
    (img) => String(img.imagen_url || "") === String(prod.imagen_url || "")
  );
  // Siempre comparar ids como string para evitar problemas de tipo
  const fallbackPrimaryImageId = imageFromProducto?.id ? String(imageFromProducto.id) : (imagesArr[0]?.id ? String(imagesArr[0].id) : null);
  const selectedPrimaryImageId = editData.primaryImageId ? String(editData.primaryImageId) : fallbackPrimaryImageId;
  const selectedPrimaryImage =
    imagesArr.find((img) => String(img.id) === String(selectedPrimaryImageId)) ??
    imagesArr[0] ??
    null;
  const firstImage = selectedPrimaryImage?.imagen_url || ""; // Solo producto

  const normalizeColor = (value) => {
    const raw = String(value || "").trim().replace(/\s+/g, " ");
    if (!raw) return "";
    return raw
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{prod.nombre}</h2>
          <p className="text-xs text-slate-500">ID: {productId}</p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
          Editor avanzado
        </span>
      </div>

      {firstImage && (
        <div className="flex justify-center">
          <img
            src={getOptimizedImageUrl(firstImage, 360)}
            srcSet={buildImageSrcSet(firstImage, [180, 360, 720], { quality: 95, format: "origin" })}
            sizes="144px"
            loading="lazy"
            decoding="async"
            alt={prod.nombre}
            className="w-36 h-36 object-cover rounded-lg border"
          />
        </div>
      )}

      <ImageManager
        prodId={productId}
        images={imagesArr}
        editData={editData}
        primaryImageId={selectedPrimaryImageId}
        onSetPrimaryImage={(pid, image) => {
          setEditDataField(pid, "primaryImageId", image.id);
          setEditDataField(pid, "primaryImageUrl", image.imagen_url);
        }}
        handleAddImages={handleAddImages}
        handleRemoveImage={handleRemoveImage}
        handleReplaceImage={handleReplaceImage}
        handleReorderImages={handleReorderImages}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="flex flex-col">
          <label className="font-semibold text-gray-700">Nombre</label>
          <Input
            value={editData.nombre ?? prod.nombre}
            onChange={(e) =>
              setEditDataField(productId, "nombre", e.target.value)
            }
          />
        </div>

        <div className="flex flex-col">
          <label className="font-semibold text-gray-700">Descripción</label>
          <Input
            value={editData.descripcion ?? prod.descripcion}
            onChange={(e) =>
              setEditDataField(productId, "descripcion", e.target.value)
            }
          />
        </div>

        <div className="flex flex-col">
          <label className="font-semibold text-gray-700">Código de barra</label>
          <Input
            value={editData.codigo_barra ?? prod.codigo_barra}
            onChange={(e) =>
              setEditDataField(productId, "codigo_barra", e.target.value)
            }
          />
        </div>

        <div className="flex flex-col">
          <label className="font-semibold text-gray-700">Categoría</label>
          <select
            value={editData.category_id ?? prod.category_id ?? ""}
            onChange={(e) =>
              setEditDataField(productId, "category_id", e.target.value)
            }
            className="p-3 border-indigo-500 rounded-lg"
          >
            <option value="">-- Seleccionar Categoría --</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.categori}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="font-semibold text-gray-700">Precio</label>
          <Input
            type="number"
            value={editData.precio ?? prod.precio}
            onChange={(e) =>
              setEditDataField(productId, "precio", e.target.value)
            }
          />
        </div>

        <div className="flex flex-col">
          <label className="font-semibold text-gray-700">Stock</label>
          <Input
            type="number"
            value={variantsArr.length > 0 ? totalStockFromVariants : (editData.stock ?? prod.stock)}
            onChange={(e) =>
              setEditDataField(productId, "stock", e.target.value)
            }
            readOnly={variantsArr.length > 0}
          />
          {variantsArr.length > 0 && (
            <span className="text-xs text-gray-500 mt-1">Stock calculado desde colores</span>
          )}
        </div>
      </div>

      <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Colores disponibles</h3>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() =>
                setEditDataField(
                  productId,
                  "variantes",
                  (editData.originalVariants || []).map((v) => ({ ...v }))
                )
              }
              className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 px-3 py-1 text-sm"
            >
              Restaurar colores
            </Button>
            <Button
              type="button"
              onClick={() => onAddVariantRow(productId)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 text-sm"
            >
              + Agregar color
            </Button>
          </div>
        </div>

        {variantsArr.length === 0 ? (
          <div className="text-sm text-slate-600">Sin colores. Puedes guardar asi o agregar nuevos colores.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-slate-500 mb-1">
              Lista editable por variante: color, stock, precio, SKU y estado.
            </div>
            <div className="text-xs text-gray-600 mb-2 grid grid-cols-1 md:grid-cols-6 gap-2 px-2">
              <span>Color</span>
              <span>Stock</span>
              <span>Precio</span>
              <span>SKU</span>
              <span>Activo</span>
              <span></span>
            </div>
            {variantsArr.map((variant, idx) => (
              <div key={`${productId}-variant-${variant.id ?? idx}`} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center bg-white border border-slate-200 rounded-lg p-2">
                <Input
                  value={variant.color ?? ""}
                  onChange={(e) => onVariantFieldChange(productId, idx, "color", e.target.value)}
                  onBlur={(e) => onVariantFieldChange(productId, idx, "color", normalizeColor(e.target.value))}
                  placeholder="Color"
                  className="text-sm"
                />
                <Input
                  type="number"
                  min="0"
                  value={variant.stock ?? 0}
                  onChange={(e) => onVariantFieldChange(productId, idx, "stock", e.target.value)}
                  placeholder="Stock"
                  className="text-sm"
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={variant.precio ?? ""}
                  onChange={(e) => onVariantFieldChange(productId, idx, "precio", e.target.value)}
                  placeholder="Precio"
                  className="text-sm"
                />
                <Input
                  value={variant.sku ?? ""}
                  onChange={(e) => onVariantFieldChange(productId, idx, "sku", e.target.value)}
                  placeholder="SKU (opt)"
                  className="text-sm"
                />
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={variant.activo !== false}
                    onChange={(e) => onVariantFieldChange(productId, idx, "activo", e.target.checked)}
                  />
                  Activo
                </label>
                <Button
                  type="button"
                  onClick={() => onRemoveVariantRow(productId, idx)}
                  className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 text-xs"
                >
                  Eliminar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-center mt-6">
        <Button
          onClick={() => openConfirm(productId)}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
        >
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
