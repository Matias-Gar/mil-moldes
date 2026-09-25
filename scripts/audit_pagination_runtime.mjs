// Read-only verification: compare fully loaded rows with database counts.
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fetchCompleteQuery } from '../lib/supabasePagination.js';

config({ path: '.env.local', quiet: true });
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SECRET_KEY;
if (!key || !process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('Falta la configuración de Supabase para la verificación de lectura.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sources = {
  productos: 'user_id', v_productos_catalogo: 'producto_id', producto_variantes: 'id',
  producto_imagenes: 'id', categorias: 'id', ventas: 'id', ventas_detalle: 'id',
  ventas_pagos: 'id', stock_movimientos: 'id', cash_movements: 'id', promociones: 'id', packs: 'id',
};
for (const [table, primaryKey] of Object.entries(sources)) {
  const [loaded, counted] = await Promise.all([
    fetchCompleteQuery(db.from(table).select(primaryKey), primaryKey),
    db.from(table).select(primaryKey, { count: 'exact', head: true }),
  ]);
  if (loaded.error || counted.error) throw new Error(`${table}: ${(loaded.error || counted.error).message}`);
  assert.equal(loaded.data.length, counted.count, `${table}: incomplete load (or concurrent database changes)`);
  assert.equal(new Set(loaded.data.map((row) => row[primaryKey])).size, counted.count, `${table}: duplicated rows`);
  console.log(`${table}: ${loaded.data.length}/${counted.count} OK`);
}

const { data: products, error } = await fetchCompleteQuery(db.from('productos').select('user_id,sucursal_id'), 'user_id');
if (error) throw error;
for (const branch of new Set(products.map((row) => row.sucursal_id).filter(Boolean))) {
  const ids = products.filter((row) => row.sucursal_id === branch).map((row) => row.user_id);
  for (const table of ['producto_variantes', 'producto_imagenes']) {
    const loaded = await fetchCompleteQuery(() => db.from(table).select('id,producto_id').eq('sucursal_id', branch), 'id', { column: 'producto_id', values: ids });
    const counted = await db.from(table).select('id', { count: 'exact', head: true }).eq('sucursal_id', branch);
    if (loaded.error || counted.error) throw new Error(`${table}: ${(loaded.error || counted.error).message}`);
    assert.equal(loaded.data.length, counted.count, `${table}: incomplete related rows for branch`);
    console.log(`${table} by branch (${ids.length} product IDs): ${loaded.data.length}/${counted.count} OK`);
  }
}
