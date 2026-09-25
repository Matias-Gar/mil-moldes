import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { fetchCompleteQuery } from '../lib/supabasePagination.js';
import { getCashSummary, listCashMovements } from '../services/cash.service.js';

// Exercise real PostgREST query builders, including their mutable filters.
function database(tables, { cap = 1000, failOffset = Infinity } = {}) {
  const requests = [];
  const db = createClient('https://example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      assert.equal(init.method, 'GET', 'pagination must only read');
      const url = new URL(input);
      requests.push(url);
      let rows = [...(tables[url.pathname.split('/').at(-1)] || [])];
      for (const [column, filter] of url.searchParams) {
        if (['select', 'order', 'offset', 'limit'].includes(column)) continue;
        if (filter.startsWith('eq.')) rows = rows.filter((row) => String(row[column]) === filter.slice(3));
        else if (filter.startsWith('gte.')) rows = rows.filter((row) => row[column] >= filter.slice(4));
        else if (filter.startsWith('lte.')) rows = rows.filter((row) => row[column] <= filter.slice(4));
        else if (filter.startsWith('in.')) {
          assert.equal(url.searchParams.getAll(column).length, 1, 'IN filters must not accumulate between chunks');
          const values = filter.slice(4, -1).split(',');
          assert.ok(values.length <= 100, 'bound the request URL');
          rows = rows.filter((row) => values.includes(String(row[column])));
        } else throw new Error(`Unhandled filter ${column}: ${filter}`);
      }
      const orders = (url.searchParams.get('order') || '').split(',').filter(Boolean);
      assert.ok(orders.length, 'every page needs deterministic ordering');
      rows.sort((a, b) => {
        for (const order of orders) {
          const [key, direction] = order.split('.');
          const compare = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
          if (compare) return direction === 'desc' ? -compare : compare;
        }
        return 0;
      });
      const offset = Number(url.searchParams.get('offset') || 0);
      if (offset >= failOffset) return new Response(JSON.stringify({ message: 'page failed', code: 'TEST' }), { status: 500 });
      const limit = Math.min(Number(url.searchParams.get('limit') || cap), cap);
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { status: 200 });
    } },
  });
  return { db, requests };
}

for (const cap of [1000, 137]) {
  test(`retrieves 3505 products without gaps when server cap is ${cap}`, async () => {
    const productos = Array.from({ length: 3505 }, (_, user_id) => ({ user_id, nombre: 'MOLDE', sucursal_id: 'central' })).reverse();
    const { db } = database({ productos: [...productos, { user_id: -1, sucursal_id: 'other' }] }, { cap });
    const result = await fetchCompleteQuery(db.from('productos').select('*').eq('sucursal_id', 'central').order('nombre'), 'user_id');
    assert.equal(result.error, null);
    assert.deepEqual(result.data.map((row) => row.user_id), Array.from({ length: 3505 }, (_, id) => id));
  });
}

test('chunks 251 IDs and paginates more than 1000 variants inside a single chunk', async () => {
  const variants = Array.from({ length: 251 }, (_, id) => ({ id, producto_id: id, sucursal_id: 'central' }));
  variants.push(...Array.from({ length: 1205 }, (_, i) => ({ id: 251 + i, producto_id: 0, sucursal_id: 'central' })));
  const { db, requests } = database({ producto_variantes: variants });
  const ids = Array.from({ length: 251 }, (_, id) => id);
  const result = await fetchCompleteQuery(() => db.from('producto_variantes').select('*').eq('sucursal_id', 'central'), 'id', { column: 'producto_id', values: [...ids, 0] });
  assert.equal(result.data.length, 1456);
  assert.equal(new Set(result.data.map((row) => row.id)).size, 1456);
  assert.ok(requests.some((url) => Number(url.searchParams.get('offset')) === 1000));
});

test('does not request empty ID lists and never returns partial data on errors', async () => {
  const { db, requests } = database({ productos: Array.from({ length: 1200 }, (_, id) => ({ id })) }, { failOffset: 1000 });
  const empty = await fetchCompleteQuery(() => db.from('productos').select('*'), 'id', { column: 'id', values: [] });
  assert.deepEqual(empty.data, []);
  assert.equal(requests.length, 0);
  const failed = await fetchCompleteQuery(db.from('productos').select('*'));
  assert.equal(failed.data, null);
  assert.equal(failed.error.message, 'page failed');
});

test('cash summary and date-filtered movements include all records; recent preview stays bounded', async () => {
  const rows = Array.from({ length: 2505 }, (_, id) => ({
    id, date: '2026-09-25T12:00:00.000Z', fecha: '2026-09-25T12:00:00.000Z',
    sucursal_id: 'central', cashbox_id: 'main', type: 'income', payment_method: 'cash',
    amount: 1, total: 2, modo_pago: 'efectivo', description: 'Manual',
  }));
  const { db } = database({ cash_movements: rows, ventas: rows });
  const params = { start_date: '2026-09-25', end_date: '2026-09-25', sucursal_id: 'central' };
  const summary = await getCashSummary(db, params);
  assert.equal(summary.movements.length, 2505);
  assert.equal(summary.sales.length, 2505);
  assert.equal(summary.totals.income, 7515);
  const movements = await listCashMovements(db, { ...params, limit: 200 });
  assert.equal(movements.length, 2505);
  const recent = await listCashMovements(db, { sucursal_id: 'central', limit: 8 });
  assert.equal(recent.length, 8);
});
