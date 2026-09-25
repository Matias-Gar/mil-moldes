import { fetchAllRows } from './supabasePagination.js';

async function readAll(table, buildQuery) {
  const { data, error } = await fetchAllRows((from, to) => buildQuery().range(from, to));
  if (error) throw new Error(`${table}: ${error.message || error}`);
  return data;
}

export async function loadStockAuditData(db, sucursalId) {
  const scoped = (table, columns = '*') => {
    const query = db.from(table).select(columns);
    return sucursalId ? query.eq('sucursal_id', sucursalId) : query;
  };
  const [productos, detalles, variantes, movimientos, transferencias, reconciliacion] = await Promise.all([
    readAll('productos', () => scoped('productos', 'user_id, nombre, stock, stock_inicial, unidad_base, unidades_alternativas, factor_conversion').order('user_id')),
    readAll('ventas_detalle', () => scoped('ventas_detalle', 'producto_id, cantidad, cantidad_base, unidad, variante_id, created_at, usuario_email').order('id')),
    readAll('producto_variantes', () => scoped('producto_variantes').order('id')),
    readAll('stock_movimientos', () => scoped('stock_movimientos').order('id')),
    readAll('transferencias_sucursal', () => {
      let query = db.from('transferencias_sucursal').select('*').order('id');
      if (sucursalId) query = query.or(`sucursal_origen_id.eq.${sucursalId},sucursal_destino_id.eq.${sucursalId}`);
      return query;
    }),
    readAll('inventory_reconciliation', () => db.from('inventory_reconciliation')
      .select('producto_id,variante_id,stock_reconstruido,diferencia,estado').order('producto_id').order('variante_id')),
  ]);
  return { productos, detalles, variantes, movimientos, transferencias, reconciliacion };
}

export function loadStockAuditHistory(db, sucursalId, productoId) {
  return readAll('productos_historial', () => {
    let query = db.from('productos_historial')
      .select('id, accion, datos_anteriores, datos_nuevos, usuario_email, fecha, producto_id')
      .eq('producto_id', productoId).order('fecha', { ascending: false }).order('id');
    if (sucursalId) query = query.eq('sucursal_id', sucursalId);
    return query;
  });
}
