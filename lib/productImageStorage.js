import { resolveStorageImageUrl } from './storageUrls.js';

export const PRODUCT_IMAGE_BUCKET = 'product_images';
export const PRODUCT_IMAGE_MAX_BYTES = 4.2 * 1024 * 1024;

function uploadErrorMessage(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  const message = String(error?.message || error || 'Error desconocido');
  if (status === 504 || /\b504\b|timeout|timed out/i.test(message)) {
    return 'Storage no respondio a tiempo (HTTP 504). No se pudo confirmar la subida. Conserva el formulario y verifica el servicio antes de reintentar.';
  }
  if (status === 403 || /row.level security|unauthorized|\b403\b/i.test(message)) {
    return 'Storage rechazo la subida por permisos. Verifica la sesion y las politicas del bucket product_images.';
  }
  return `Error al subir imagen a Storage (${PRODUCT_IMAGE_BUCKET}): ${message}`;
}

/** Shared by product screens; uploads never overwrite an existing object.
 * Dependencies are explicit so failure/cleanup behavior can be tested offline.
 */
export function createProductImageUploader({
  supabase,
  optimizeImageForUpload,
  createId = () => crypto.randomUUID(),
  resolveUrl = resolveStorageImageUrl,
  folder = 'public',
}) {
  if (!['public', 'packs', 'store'].includes(folder)) throw new Error('Carpeta de imagenes no permitida.');
  return async function uploadProductImages(files) {
    const inputs = Array.from(files || []);
    if (!inputs.length) return [];
    const prepared = [];
    // Validate the entire batch before writing the first object.
    for (const input of inputs) {
      if (!input?.type?.startsWith('image/')) throw new Error('Selecciona un archivo de imagen valido.');
      const { file } = await optimizeImageForUpload(input);
      if (!file || !file.type?.startsWith('image/') || !Number.isFinite(file.size) || file.size <= 0) {
        throw new Error('La imagen esta vacia o no es valida.');
      }
      if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
        throw new Error(`La imagen "${input.name}" supera el limite de 4.2 MB. Usa una imagen mas pequena.`);
      }
      prepared.push(file);
    }

    const bucket = supabase.storage.from(PRODUCT_IMAGE_BUCKET);
    const uploadedPaths = [];
    const urls = [];
    try {
      // Bound concurrency to one: parallel multi-megabyte requests can exhaust
      // the self-hosted Storage connection pool and compete for the same uplink.
      for (const file of prepared) {
        const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
          'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg' })[file.type]
          || String(file.name).split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'img';
        const path = `${folder}/${createId()}.${extension}`;
        const { error } = await bucket.upload(path, file, {
          cacheControl: '31536000', upsert: false, contentType: file.type,
        });
        if (error) throw error;
        uploadedPaths.push(path);
        const { data } = bucket.getPublicUrl(path);
        const url = resolveUrl(data?.publicUrl);
        if (!url || !/^https?:\/\//.test(url)) throw new Error('Storage no devolvio una URL publica valida.');
        urls.push(url);
      }
      return urls;
    } catch (cause) {
      const error = new Error(uploadErrorMessage(cause), { cause });
      // These unique paths belong only to this unfinished batch; never derive
      // deletion paths from historic database URLs or delete product references.
      if (uploadedPaths.length) {
        try {
          const { error: cleanupError } = await bucket.remove(uploadedPaths);
          if (cleanupError) throw cleanupError;
        } catch {
          error.message += ' No se pudo confirmar la limpieza de las fotos temporales.';
        }
      }
      throw error;
    }
  };
}
