import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEditProductCatalog } from '../lib/editProductCatalog.js';

function database(tables, failTable) {
  return {
    from(table) {
      let rows = [...(tables[table] || [])];
      const orders = [];
      const query = {
        select() { return query; },
        eq(key, value) { rows = rows.filter((row) => row[key] === value); return query; },
        in(key, values) {
          assert.ok(values.length <= 100, 'related IDs must use bounded requests');
          rows = rows.filter((row) => values.includes(row[key]));
          return query;
        },
        order(key) { orders.push(key); return query; },
        range(from, to) {
          if (table === failTable && from > 0) return Promise.resolve({ data: null, error: new Error('page failed') });
          rows.sort((a, b) => {
            for (const key of orders) {
              if (a[key] < b[key]) return -1;
              if (a[key] > b[key]) return 1;
            }
            return 0;
          });
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
        },
      };
      return query;
    },
  };
}

for (const total of [0, 1000, 1001, 3505]) {
  test(`loads the entire catalog with ${total} products and respects branch`, async () => {
    const productos = Array.from({ length: total }, (_, user_id) => ({
      user_id, nombre: user_id === total - 1 ? 'YESO CERAMICO 2K.' : 'MOLDE', sucursal_id: 'central',
    }));
    const result = await loadEditProductCatalog(database({ productos: [
      ...productos, { user_id: -1, nombre: 'OTHER BRANCH', sucursal_id: 'other' },
    ] }), 'central');
    assert.equal(result.productosData.length, total);
    assert.equal(new Set(result.productosData.map((p) => p.user_id)).size, total);
    if (total) assert.equal(result.productosData.filter((p) => p.nombre.toLowerCase().includes('yes')).length, 1);
  });
}

test('loads more than 1000 images, variants and categories without truncation', async () => {
  const related = Array.from({ length: 1205 }, (_, id) => ({ id, producto_id: 1, sucursal_id: 'central' }));
  const result = await loadEditProductCatalog(database({
    productos: [{ user_id: 1, nombre: 'YESO', sucursal_id: 'central' }],
    producto_imagenes: related, producto_variantes: related, categorias: related,
  }), 'central');
  for (const key of ['imagenesData', 'variantesData', 'categoriesData']) assert.equal(result[key].length, 1205);
});

test('rejects incomplete loads when a subsequent page fails', async () => {
  const productos = Array.from({ length: 1001 }, (_, user_id) => ({ user_id, nombre: 'MOLDE' }));
  await assert.rejects(loadEditProductCatalog(database({ productos }, 'productos')), /page failed/);
  await assert.rejects(loadEditProductCatalog(database({
    productos: [{ user_id: 1 }],
    producto_variantes: Array.from({ length: 1001 }, (_, id) => ({ id, producto_id: 1 })),
  }, 'producto_variantes')), /page failed/);
});
