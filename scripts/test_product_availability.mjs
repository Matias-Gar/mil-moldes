import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableProductsFirst } from '../lib/productAvailability.js';

test('available products precede sold-out products, preserving order and fractional stock', () => {
  const products = Object.freeze([
    { id: 1, stock: 0 }, { id: 2, stock: 0.125 },
    { id: 3, stock: -1 }, { id: 4, stock: 20 }, { id: 5, stock: 0 },
  ]);
  const result = availableProductsFirst(products, p => Number(p.stock) <= 0);
  assert.deepEqual(result.map(p => p.id), [2, 4, 1, 3, 5]);
  assert.deepEqual(products.map(p => p.id), [1, 2, 3, 4, 5]);
  assert.equal(result[0], products[1]);
});

test('availability can use variant stock without modifying quantities or filtering products', () => {
  const products = [
    { id: 1, variants: [{ stock: 0 }] },
    { id: 2, variants: [{ stock: 0 }, { stock: 0.25 }] },
  ];
  const result = availableProductsFirst(products, p => !p.variants.some(v => v.stock > 0));
  assert.deepEqual(result.map(p => p.id), [2, 1]);
  assert.equal(result.length, products.length);
  assert.deepEqual(availableProductsFirst([], () => false), []);
});
