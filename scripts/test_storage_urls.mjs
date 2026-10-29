import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveStorageImageUrl, getStorageBaseUrl, isSelfHostedStorageImage, DELL_API_URL } from '../lib/storageUrls.js';

const cloud = 'https://tsqpyzvdaxzjujysyawv.supabase.co';
const dell = DELL_API_URL;
test('legacy object and Cloud render URLs use Dell originals, preserving encoded object keys and download parameters', () => {
  for (const path of ['/storage/v1/object/public/', '/storage/v1/render/image/public/']) {
    assert.equal(resolveStorageImageUrl(`${cloud}${path}product_images/folder/a%20b%2Bc.jpg?width=120&quality=94&format=origin&download=photo.jpg`, dell), `${dell}/storage/v1/object/public/product_images/folder/a%20b%2Bc.jpg?download=photo.jpg`);
  }
});
test('new uploads, relative public paths and proxy prefixes resolve idempotently', () => {
  for (const target of [dell, 'https://storage.example.test:8443/supabase/']) {
    const result = resolveStorageImageUrl(`${cloud}/storage/v1/object/public/product_images/a.jpg`, target);
    assert.equal(result, `${target.replace(/\/$/, '')}/storage/v1/object/public/product_images/a.jpg`);
    assert.equal(resolveStorageImageUrl(result, target), result);
    assert.equal(resolveStorageImageUrl('/storage/v1/object/public/product_images/a.jpg', target), result);
  }
});
test('unrelated origins, local files, signed/private URLs, data and blob values are not rewritten', () => {
  for (const value of ['', '/file.svg', 'blob:https://app.test/id', 'data:image/png;base64,AAA', 'https://other.supabase.co/storage/v1/object/public/a/b.jpg', `${cloud}/storage/v1/object/sign/a/b.jpg?token=private`, 'https://tsqpyzvdaxzjujysyawv.supabase.co.evil.test/storage/v1/object/public/a/b.jpg']) {
    assert.equal(resolveStorageImageUrl(value, dell), value);
  }
  assert.equal(resolveStorageImageUrl(null, dell), '');
});
test('old local endpoint cannot send migrated images back to Cloud; custom origin remains explicit', () => {
  assert.equal(getStorageBaseUrl(cloud), dell);
  assert.equal(getStorageBaseUrl('https://storage.example.test/'), 'https://storage.example.test');
  assert.throws(() => getStorageBaseUrl('https://user:password@example.test'));
  assert.throws(() => getStorageBaseUrl('file:///tmp/image'));
});
test('direct image policy only applies to public images on the configured origin', () => {
  const previousApi = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousStorage = process.env.NEXT_PUBLIC_STORAGE_URL;
  try {
    process.env.NEXT_PUBLIC_STORAGE_URL = dell;
    assert.ok(isSelfHostedStorageImage(resolveStorageImageUrl(`${cloud}/storage/v1/object/public/product_images/a.jpg`)));
    assert.equal(isSelfHostedStorageImage(`${dell}/rest/v1/productos`), false);
    assert.equal(isSelfHostedStorageImage(`${dell}/storage/v1/object/sign/product_images/a.jpg?token=x`), false);
    assert.equal(isSelfHostedStorageImage('https://unrelated.test/storage/v1/object/public/a/b.jpg'), false);
  } finally {
    if (previousApi === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousApi;
    if (previousStorage === undefined) delete process.env.NEXT_PUBLIC_STORAGE_URL; else process.env.NEXT_PUBLIC_STORAGE_URL = previousStorage;
  }
});
