import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const { getImgProps } = require('next/dist/shared/lib/get-img-props');
const { imageConfigDefault } = require('next/dist/shared/lib/image-config');
const defaultLoader = require('next/dist/shared/lib/image-loader').default;
function loadSource(relative, jsx = false) {
  const filename = new URL(relative, import.meta.url);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: jsx ? ts.JsxEmit.ReactJSX : undefined, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(createRequire(filename), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const StorageImage = loadSource('../components/StorageImage.tsx', true).default;
const { GET } = loadSource('../app/api/image-proxy/route.js');
const old = 'https://tsqpyzvdaxzjujysyawv.supabase.co/storage/v1/object/public/product_images/a.jpg';
const dell = 'https://milmoldes.duckdns.org/storage/v1/object/public/product_images/a.jpg';

test('sales/catalog wrapper emits a Dell URL directly, avoiding /_next/image even with old database URLs', () => {
  const previous = process.env.NEXT_PUBLIC_STORAGE_URL;
  try {
    process.env.NEXT_PUBLIC_STORAGE_URL = 'https://milmoldes.duckdns.org';
    const element = StorageImage({ src: old, alt: 'Product', width: 40, height: 40, quality: 94 });
    assert.equal(element.props.src, dell);
    assert.equal(element.props.unoptimized, true);
    const { props } = getImgProps(element.props, { defaultLoader, imgConf: { ...imageConfigDefault, qualities: [75, 94, 95, 96, 99] } });
    assert.equal(props.src, dell);
    assert.equal(props.srcSet, undefined);
    const local = StorageImage({ src: '/file.svg', alt: 'Local', width: 40, height: 40 });
    assert.equal(local.props.src, '/file.svg');
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_STORAGE_URL; else process.env.NEXT_PUBLIC_STORAGE_URL = previous;
  }
});

test('image proxy migrates legacy URLs, enforces MIME, bounds files and rejects arbitrary origins', async () => {
  const previousStorage = process.env.NEXT_PUBLIC_STORAGE_URL;
  const originalFetch = globalThis.fetch;
  try {
    process.env.NEXT_PUBLIC_STORAGE_URL = 'https://milmoldes.duckdns.org';
    let calls = 0;
    const req = (url) => new Request(`http://localhost/api/image-proxy?url=${encodeURIComponent(url)}`);
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, dell);
      assert.equal(init.redirect, 'error');
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    };
    const success = await GET(req(old));
    assert.equal(success.status, 200);
    assert.equal((await success.json()).dataUrl, 'data:image/jpeg;base64,AQID');
    for (const url of ['http://127.0.0.1/admin', 'https://unrelated.test/a.jpg', 'https://milmoldes.duckdns.org/rest/v1/perfiles']) {
      assert.equal((await GET(req(url))).status, 400);
    }
    assert.equal(calls, 1);
    globalThis.fetch = async () => new Response('Login required', { headers: { 'content-type': 'text/html' } });
    assert.equal((await GET(req(dell))).status, 502);
    globalThis.fetch = async () => new Response('x', { headers: { 'content-type': 'image/jpeg', 'content-length': String(11 * 1024 * 1024) } });
    assert.equal((await GET(req(dell))).status, 413);
    for (const [bytes, mime] of [
      [new Uint8Array([255,216,255,224]), 'image/jpeg'],
      [new Uint8Array([137,80,78,71,13,10,26,10]), 'image/png'],
      [Buffer.from('0000001c667479706176696600000000617669666d696631', 'hex'), 'image/avif'],
    ]) {
      globalThis.fetch = async () => new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });
      const binary = await GET(req(dell));
      assert.equal(binary.status, 200);
      assert.ok((await binary.json()).dataUrl.startsWith(`data:${mime};base64,`));
    }
    globalThis.fetch = async () => new Response('<html>Login</html>', { headers: { 'content-type': 'application/octet-stream' } });
    assert.equal((await GET(req(dell))).status, 502);
    globalThis.fetch = async () => new Response('Not found', { status: 404 });
    assert.equal((await GET(req(dell))).status, 502);
    globalThis.fetch = async () => { throw new Error('redirect blocked'); };
    assert.equal((await GET(req(dell))).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousStorage === undefined) delete process.env.NEXT_PUBLIC_STORAGE_URL; else process.env.NEXT_PUBLIC_STORAGE_URL = previousStorage;
  }
});
