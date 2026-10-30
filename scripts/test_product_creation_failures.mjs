import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual page handlers with controlled dependencies, so the tests
// cover side effects and recovery rather than copies of the implementation.
async function handler(filename, name) {
  const source = ts.createSourceFile(filename, await readFile(new URL(`../${filename}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let result;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) result = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(result, `handler ${name} exists`);
  return context => vm.runInNewContext(`(${result})`, context);
}

function dependencies(options = {}) {
  const writes = [];
  const messages = [];
  const state = {
    createdProductRef: { current: null }, createBusyRef: { current: false },
    newProduct: { nombre: 'New item', descripcion: 'Description', precio: '10', precio_compra: '5', unidad_base: 'unidad', stock: '0' },
    newVariants: options.variants || [{ color: 'Unico', sku: 'new-sku', stock: 0 }], imageFiles: [{ type: 'image/png' }],
    activeSucursalId: 'branch', currentProductView: 'articulos',
    setMessage: message => messages.push(message), setLoading() {}, setCreationNeedsReview() {}, setShowNameRepeatModal() {}, setShowColorRepeatModal() {},
    confirmMissingProductData: () => true,
    fetchCompleteQuery: async () => ({ data: [], error: options.readError ? new Error('read failed') : null }),
    uploadProductImages: async () => {
      writes.push('upload');
      if (options.uploadError) throw new Error('HTTP 504');
      return ['https://milmoldes.duckdns.org/storage/v1/object/public/product_images/public/new.png'];
    },
    insertWithOptionalSucursal: async table => {
      writes.push(table);
      return table === 'productos'
        ? { data: [{ user_id: 42 }], error: null }
        : { data: null, error: new Error('gallery denied') };
    },
    supabase: { from() {
      const query = { select() { return query; }, ilike() { return query; }, or() { return query; }, eq() { return query; } };
      return query;
    } },
    generateVariantBarcode: () => 'generated', generateBarcode: () => 'generated', normalizeProductView: value => value || 'articulos',
    parseDecimalInput: Number,
    console: { error() {}, warn() {} },
  };
  return { state, writes, messages };
}

for (const [filename, name] of [
  ['app/admin/productos/nuevo/page.js', 'handleAnadirProducto'],
  ['app/admin/productos/page.js', 'handleAñadirProducto'],
]) {
  const build = await handler(filename, name);
  test(`${filename}: upload timeout never inserts a product and releases busy state`, async () => {
    const h = dependencies({ uploadError: true });
    await build(h.state)({ preventDefault() {} });
    assert.deepEqual(h.writes, ['upload']);
    assert.equal(h.state.createdProductRef.current, null);
    assert.equal(h.state.createBusyRef.current, false);
    assert.match(h.messages.at(-1), /504/);
  });
  test(`${filename}: gallery failure keeps the created ID and prevents duplicate creation on retry`, async () => {
    const h = dependencies();
    const run = build(h.state);
    await run({ preventDefault() {} });
    assert.equal(h.state.createdProductRef.current, 42);
    assert.match(h.messages.at(-1), /42.*incompleto/);
    await run({ preventDefault() {} });
    assert.deepEqual(h.writes, ['upload', 'productos', 'producto_imagenes']);
    assert.match(h.messages.at(-1), /ya fue creado/);
    assert.equal(h.state.createBusyRef.current, false);
  });
  test(`${filename}: a concurrent submit does not start another operation`, async () => {
    const h = dependencies();
    h.state.createBusyRef.current = true;
    await build(h.state)({ preventDefault() {} });
    assert.deepEqual(h.writes, []);
  });
}

const buildNew = await handler('app/admin/productos/nuevo/page.js', 'handleAnadirProducto');
test('duplicate variants are rejected before uploading a single image', async () => {
  const h = dependencies({ variants: [{ color: 'Rojo', sku: 'a' }, { color: 'ROJO', sku: 'b' }] });
  await buildNew(h.state)({ preventDefault() {} });
  assert.deepEqual(h.writes, []);
  assert.equal(h.state.createBusyRef.current, false);
});
test('a duplicate-name read failure does not proceed with an uncertain creation', async () => {
  const h = dependencies({ readError: true });
  await buildNew(h.state)({ preventDefault() {} });
  assert.deepEqual(h.writes, []);
  assert.equal(h.state.createBusyRef.current, false);
  assert.match(h.messages.at(-1), /read failed/);
});
