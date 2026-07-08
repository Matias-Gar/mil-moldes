import { getOptimizedImageUrl, buildImageSrcSet } from "@/lib/imageOptimization";

export default function ImageManager({
  prodId,
  images,
  editData,
  primaryImageId,
  onSetPrimaryImage,
  handleAddImages,
  handleRemoveImage,
  handleReplaceImage,
  handleReorderImages,
}) {
  const isFileImage = (value) =>
    typeof File !== "undefined" && value instanceof File;

  const getImageUrl = (image) => {
    if (!image) return "";
    if (typeof image === "string") return image;
    if (isFileImage(image)) return URL.createObjectURL(image);
    return image.imagen_url || "";
  };

  const getImageKey = (image, index) => {
    if (image?.id) return image.id;
    if (isFileImage(image)) return `${image.name}-${image.lastModified}-${index}`;
    return `${getImageUrl(image)}-${index}`;
  };

  const onDragStart = (event, index) => {
    event.dataTransfer.setData("text/plain", String(index));
  };

  const onDragOver = (e) => e.preventDefault();

  const onDrop = (event, index) => {
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(fromIndex)) handleReorderImages(prodId, fromIndex, index);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4">
        {images?.map((imgObj, idx) => {
          const imageUrl = getImageUrl(imgObj);
          const isLocalFile = isFileImage(imgObj);
          return (
          <div
            key={getImageKey(imgObj, idx)}
            draggable
            onDragStart={(event) => onDragStart(event, idx)}
            onDragOver={onDragOver}
            onDrop={(event) => onDrop(event, idx)}
            className="relative border rounded-lg overflow-hidden"
          >
            <img
              src={isLocalFile ? imageUrl : getOptimizedImageUrl(imageUrl, 420)}
              srcSet={isLocalFile ? undefined : buildImageSrcSet(imageUrl, [210, 420, 840], { quality: 95, format: "origin" })}
              sizes="(max-width: 768px) 33vw, 210px"
              loading="lazy"
              decoding="async"
              alt="Producto"
              className="w-full h-28 object-cover"
            />

            {String(primaryImageId ?? "") === String(imgObj.id) && (
              <div className="absolute bottom-1 left-1 bg-indigo-600 text-white px-2 py-1 text-xs rounded">
                Principal
              </div>
            )}

            <div className="absolute top-1 right-1 flex gap-1">
              <button
                type="button"
                className="bg-indigo-500 text-white px-2 py-1 text-xs rounded"
                onClick={() => onSetPrimaryImage?.(prodId, imgObj)}
              >
                Principal
              </button>

              <label className="bg-yellow-400 text-white px-2 py-1 text-xs rounded cursor-pointer">
                Reemplazar
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleReplaceImage(prodId, idx, e.target.files?.[0])}
                />
              </label>

              <button
                className="bg-red-500 text-white px-2 py-1 text-xs rounded"
                onClick={() => handleRemoveImage(prodId, idx)}
              >
                Eliminar
              </button>
            </div>
          </div>
        )})}
      </div>

      {editData.newImages?.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {editData.newImages.map((file, index) => (
            <div key={index} className="border rounded-lg overflow-hidden">
              <img
                src={URL.createObjectURL(file)}
                loading="lazy"
                decoding="async"
                alt={`Vista previa ${index + 1}`}
                className="w-full h-28 object-cover"
              />
            </div>
          ))}
        </div>
      )}

      <label className="block cursor-pointer border border-dashed border-indigo-500 text-indigo-500 text-center py-3 rounded-lg font-medium">
        + Añadir imágenes
        <input
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => handleAddImages(prodId, e.target.files)}
        />
      </label>
    </div>
  );
}
