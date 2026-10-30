import { fetchCompleteQuery } from './supabasePagination.js';

/** Check RETURNING rows: RLS can silently turn UPDATE/DELETE into zero rows. */
export async function requireAffectedRows(query, key, message, expected = 1) {
  const { data, error } = await query.select(key);
  if (error) throw error;
  if (!Array.isArray(data) || data.length !== expected) throw new Error(message);
  return data;
}

/** Keep stored URLs unchanged (including migrated Cloud URLs). Never delete a
 * physical object here: it may still serve another branch, variant or archive.
 * Insert replacements before removing old references, checking every result.
 */
export async function syncProductImageReferences(supabase, { productId, branchId, urls }) {
  if (productId === undefined || productId === null) throw new Error('Falta el identificador del producto.');
  const desired = [...new Set(urls.filter((url) => typeof url === 'string' && url.trim()))];
  let query = supabase.from('producto_imagenes').select('id,imagen_url').eq('producto_id', productId);
  if (branchId) query = query.eq('sucursal_id', branchId);
  const { data: current, error } = await fetchCompleteQuery(query);
  if (error) throw error;
  const existing = new Set(current.map((image) => image.imagen_url));
  const additions = desired.filter((url) => !existing.has(url)).map((imagen_url) => ({
    producto_id: productId, sucursal_id: branchId || null, imagen_url,
  }));
  if (additions.length) {
    await requireAffectedRows(supabase.from('producto_imagenes').insert(additions), 'id',
      'No se pudieron guardar todas las imagenes. Verifica los permisos.', additions.length);
  }
  const removals = current.filter((image) => !desired.includes(image.imagen_url)).map((image) => image.id);
  if (removals.length) {
    let removal = supabase.from('producto_imagenes').delete().in('id', removals).eq('producto_id', productId);
    if (branchId) removal = removal.eq('sucursal_id', branchId);
    await requireAffectedRows(removal, 'id', 'No se pudieron quitar todas las imagenes. Verifica los permisos.', removals.length);
  }
}
