import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireAffectedRows, syncProductImageReferences } from '../lib/productImageReferences.js';

function database(rows, options = {}) {
  const calls = [];
  let nextId = 100;
  return {
    rows, calls,
    from(table) {
      assert.equal(table, 'producto_imagenes');
      const filters = [];
      let operation = 'read';
      let additions;
      const matches = row => filters.every(test => test(row));
      const query = {
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        order() { return query; },
        range(from, to) {
          calls.push(['read']);
          return Promise.resolve(options.readError ? { error: new Error('read failed') } : { data: rows.filter(matches).slice(from, to + 1), error: null });
        },
        insert(values) { operation = 'insert'; additions = values; return query; },
        delete() { operation = 'delete'; return query; },
        select() {
          if (operation === 'read') return query;
          calls.push([operation]);
          if (options.fail === operation) return Promise.resolve({ error: new Error(`${operation} failed`) });
          if (options.zero === operation) return Promise.resolve({ data: [], error: null });
          let affected;
          if (operation === 'insert') {
            affected = additions.map(row => ({ ...row, id: nextId++ }));
            rows.push(...affected);
          } else {
            affected = rows.filter(matches);
            for (const row of affected) rows.splice(rows.indexOf(row), 1);
          }
          return Promise.resolve({ data: affected, error: null });
        },
      };
      return query;
    },
  };
}
const image = (id, url, branch = 'a', product = 1) => ({ id, imagen_url: url, sucursal_id: branch, producto_id: product });
const sync = (db, urls) => syncProductImageReferences(db, { productId: 1, branchId: 'a', urls });

test('new references are inserted before removed references; URLs are preserved and deduplicated', async () => {
  const legacy = 'https://tsqpyzvdaxzjujysyawv.supabase.co/storage/v1/object/public/product_images/a.jpg';
  const db = database([image(1, 'old'), image(2, legacy)]);
  await sync(db, [legacy, 'new', 'new']);
  assert.deepEqual(db.rows.map(row => row.imagen_url), [legacy, 'new']);
  assert.deepEqual(db.calls.filter(c => c[0] !== 'read'), [['insert'], ['delete']]);
});

test('reference deletion cannot touch the same URL on another branch or product', async () => {
  const db = database([image(1, 'shared'), image(2, 'shared', 'b'), image(3, 'shared', 'a', 2)]);
  await sync(db, []);
  assert.deepEqual(db.rows.map(row => row.id), [2, 3]);
});

test('an insertion error preserves the old references', async () => {
  const db = database([image(1, 'old')], { fail: 'insert' });
  await assert.rejects(sync(db, ['new']), /insert failed/);
  assert.deepEqual(db.rows.map(row => row.imagen_url), ['old']);
  assert.ok(!db.calls.some(c => c[0] === 'delete'));
});

test('read errors stop all mutations', async () => {
  const db = database([image(1, 'old')], { readError: true });
  await assert.rejects(sync(db, ['new']), /read failed/);
  assert.deepEqual(db.calls, [['read']]);
});

test('silent RLS deletion rejection is an error instead of success', async () => {
  const db = database([image(1, 'old')], { zero: 'delete' });
  await assert.rejects(sync(db, []), /quitar todas/);
  assert.equal(db.rows.length, 1);
});

test('silent insert rejection stops removal of original images', async () => {
  const db = database([image(1, 'old')], { zero: 'insert' });
  await assert.rejects(sync(db, ['new']), /guardar todas/);
  assert.deepEqual(db.rows.map(row => row.imagen_url), ['old']);
});

test('unchanged galleries do not write and missing product IDs fail before network', async () => {
  const db = database([image(1, 'same')]);
  await sync(db, ['same']);
  assert.ok(db.calls.every(c => c[0] === 'read'));
  await assert.rejects(syncProductImageReferences(db, { urls: [] }), /identificador/);
});

test('zero affected product/variant rows fail even without a database error', async () => {
  await assert.rejects(requireAffectedRows({ select: async () => ({ data: [], error: null }) }, 'id', 'denied'), /denied/);
  await assert.rejects(requireAffectedRows({ select: async () => ({ error: new Error('db failed') }) }, 'id', 'denied'), /db failed/);
});
