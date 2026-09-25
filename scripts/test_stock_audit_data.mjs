import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadStockAuditData, loadStockAuditHistory } from '../lib/stockAuditData.js';

function mockDatabase(failTable) {
  return { from(table) {
    let branch;
    let product;
    let transferScope;
    const orders = [];
    const query = {
      select() { return query; },
      eq(key, value) {
        if (key === 'sucursal_id') branch = value;
        if (key === 'producto_id') product = value;
        return query;
      },
      or(value) { transferScope = value; return query; },
      order(key) { orders.push(key); return query; },
      async range(from, to) {
        assert.ok(orders.length, `${table} needs stable ordering`);
        if (table === 'transferencias_sucursal') assert.equal(transferScope, 'sucursal_origen_id.eq.central,sucursal_destino_id.eq.central');
        else if (table !== 'inventory_reconciliation') assert.equal(branch, 'central');
        if (table === 'productos_historial') assert.equal(product, 232);
        if (table === failTable && from > 0) return { error: { message: 'failed next page' } };
        return { data: Array.from({ length: Math.max(0, Math.min(to + 1, 2505) - from) }, (_, i) => ({
          id: from + i, producto_id: 232, cantidad_base: 1,
        })) };
      },
    };
    return query;
  } };
}

test('paginates every audit source beyond 1000 and 2000 rows with branch scope', async () => {
  const data = await loadStockAuditData(mockDatabase(), 'central');
  assert.equal(Object.keys(data).length, 6);
  for (const rows of Object.values(data)) {
    assert.equal(rows.length, 2505);
    assert.equal(new Set(rows.map((row) => row.id)).size, 2505);
  }
  assert.equal(data.movimientos.reduce((sum, row) => sum + row.cantidad_base, 0), 2505);
});

test('paginates history and filters the selected product', async () => {
  const rows = await loadStockAuditHistory(mockDatabase(), 'central', 232);
  assert.equal(rows.length, 2505);
});

test('fails the audit instead of presenting partial data as a complete audit', async () => {
  for (const table of ['productos', 'ventas_detalle', 'producto_variantes', 'stock_movimientos', 'transferencias_sucursal', 'inventory_reconciliation']) {
    await assert.rejects(loadStockAuditData(mockDatabase(table), 'central'), new RegExp(`${table}: failed next page`));
  }
  await assert.rejects(loadStockAuditHistory(mockDatabase('productos_historial'), 'central', 232), /failed next page/);
});
