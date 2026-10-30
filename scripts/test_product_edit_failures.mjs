import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function handler(filename, name) {
  const source = ts.createSourceFile(filename, await readFile(new URL(`../${filename}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let expression;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(expression);
  return context => vm.runInNewContext(`(${expression})`, context);
}

function database({ zero = false, variantError = false } = {}) {
  const writes = [];
  const filters = [];
  return {
    writes, filters,
    from(table) {
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([table, key, value]); return query; },
        update(payload) { writes.push([table, payload]); return query; },
        insert(payload) { writes.push([table, payload]); return query; },
        then(resolve) { return Promise.resolve({
          data: zero ? [] : [{ user_id: 1, id: 5 }],
          error: variantError && table === 'producto_variantes' ? new Error('variant denied') : null,
        }).then(resolve); },
      };
      return query;
    },
  };
}

const build = await handler('app/admin/productos/editar/page.js', 'handleConfirmSave');
function setup(options = {}) {
  const db = database(options);
  const events = [];
  const context = {
    modalConfirm: { id: 1 }, productos: [{ user_id: 1, nombre: 'Product', precio: 10 }],
    editando: { 1: { variantes: options.variants || [], imagenes: [] } },
    variantes: { 1: [] }, imagenes: { 1: [] }, activeSucursalId: 'branch',
    getProductKey: p => p.user_id,
    parseDecimalInput: (value, fallback) => value == null ? fallback : Number(value),
    validarProducto: () => [],
    fetchCompleteQuery: async () => ({ data: options.current || [], error: options.readError ? new Error('read denied') : null }),
    uploadProductImages: async () => { events.push('upload'); return []; },
    isFileImage: value => value instanceof File,
    getImageUrl: image => typeof image === 'string' ? image : image?.imagen_url || '',
    normalizeProductView: () => 'articulos',
    requireAffectedRows: async (query, key, message) => {
      const { data, error } = await query.select(key);
      if (error) throw error;
      if (!data.length) throw new Error(message);
    },
    syncProductImageReferences: async () => {
      events.push('gallery');
      if (options.galleryError) throw new Error('gallery denied');
    },
    supabase: db,
    showToast: (message, type) => events.push([message, type]),
    setLoading() {}, closeConfirm() {}, setEditando: () => events.push('clear-draft'),
    console: { error() {} },
  };
  return { context, db, events };
}

test('variant read failure stops the actual editor before uploads and product writes', async () => {
  const h = setup({ readError: true });
  await build(h.context)();
  assert.deepEqual(h.db.writes, []);
  assert.ok(!h.events.includes('upload'));
  assert.match(h.events.at(-1)[0], /read denied/);
});

test('removing a variant with stock is rejected before uploads or descriptive changes', async () => {
  const h = setup({ current: [{ id: 5, stock_decimal: 0.5, color: 'Rojo' }] });
  await build(h.context)();
  assert.deepEqual(h.db.writes, []);
  assert.ok(!h.events.includes('upload'));
  assert.match(h.events.at(-1)[0], /stock/);
});

test('a variant outside the selected product/branch stops the editor before mutation', async () => {
  const h = setup({ variants: [{ id: 99 }] });
  await build(h.context)();
  assert.deepEqual(h.db.writes, []);
  assert.ok(!h.events.includes('upload'));
});

test('a product UPDATE hidden by RLS cannot report success or mutate the gallery', async () => {
  const h = setup({ zero: true });
  await build(h.context)();
  assert.ok(!h.events.includes('gallery'));
  assert.ok(!h.events.includes('clear-draft'));
  assert.equal(h.events.at(-1)[1], 'error');
});

test('gallery failure keeps the edit draft and reports failure', async () => {
  const h = setup({ galleryError: true });
  await build(h.context)();
  assert.ok(h.events.includes('gallery'));
  assert.ok(!h.events.includes('clear-draft'));
  assert.match(h.events.at(-1)[0], /gallery denied/);
});

test('a rejected variant update cannot report success and uses branch/product filters without changing stock', async () => {
  const h = setup({ variants: [{ id: 5, color: 'Rojo' }], current: [{ id: 5, stock_decimal: 3 }], variantError: true });
  await build(h.context)();
  assert.ok(!h.events.includes('gallery'));
  assert.match(h.events.at(-1)[0], /variant denied/);
  const variantPayload = h.db.writes.find(([table]) => table === 'producto_variantes')[1];
  assert.ok(!Object.hasOwn(variantPayload, 'stock'));
  assert.ok(!Object.hasOwn(variantPayload, 'stock_decimal'));
  assert.ok(h.db.filters.some(([table, key, value]) => table === 'producto_variantes' && key === 'producto_id' && value === 1));
  assert.ok(h.db.filters.some(([table, key, value]) => table === 'producto_variantes' && key === 'sucursal_id' && value === 'branch'));
});

for (const filename of ['app/admin/productos/page.js','app/admin/productos/nuevo/page.js']) {
  const buildModal = await handler(filename, 'handleGuardarEdicion');
  test(`${filename}: removing the primary image clears its fallback and scopes the gallery to the selected product/branch`, async () => {
    const db = database();
    const calls = [];
    const context = {
      editingProduct: { user_id: 1, nombre: 'Product', precio: 10 },
      editImageList: [], editImageFiles: [], activeSucursalId: 'branch', currentProductView: 'articulos',
      confirmMissingProductData: () => true,
      setMessage() {}, setLoading() {}, closeEditModal() {}, fetchProductos() {},
      normalizeProductView: () => 'articulos', supabase: db,
      requireAffectedRows: async query => { const result = await query.select('user_id'); assert.ok(result.data.length); },
      syncProductImageReferences: async (_db, input) => calls.push(input),
    };
    await buildModal(context)({ preventDefault() {} });
    assert.equal(db.writes[0][1].imagen_url, null);
    assert.equal(calls[0].productId, 1);
    assert.equal(calls[0].branchId, 'branch');
    assert.equal(calls[0].urls.length, 0);
  });
}
