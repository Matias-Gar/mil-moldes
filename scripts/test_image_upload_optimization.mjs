import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/imageUploadOptimization.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { optimizeImageForUpload } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function browser(t, { decode = true, context = true, blobSize = 50 } = {}) {
  const originals = new Map(['window','Image','document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.window = {};
  globalThis.Image = class {
    naturalWidth = 3000;
    naturalHeight = 2000;
    set src(_value) { queueMicrotask(() => decode ? this.onload() : this.onerror()); }
  };
  globalThis.document = { createElement: () => ({
    getContext: () => context ? { drawImage() {} } : null,
    toBlob: callback => callback(blobSize === null ? null : new Blob([new Uint8Array(blobSize)], { type: 'image/webp' })),
  }) };
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}
const file = (bytes, type = 'image/png') => new File([new Uint8Array(bytes)], 'photo.png', { type });

test('oversized animated/vector originals cannot bypass the hard limit', async () => {
  for (const type of ['image/gif','image/svg+xml']) {
    await assert.rejects(optimizeImageForUpload(file(101, type), { hardMaxBytes: 100 }), /limite/);
    const small = file(50, type);
    assert.equal((await optimizeImageForUpload(small, { hardMaxBytes: 100 })).file, small);
  }
});

test('decode failure preserves a small original but rejects an oversized original', async t => {
  browser(t, { decode: false });
  const small = file(50);
  assert.equal((await optimizeImageForUpload(small, { hardMaxBytes: 100 })).file, small);
  await assert.rejects(optimizeImageForUpload(file(101), { hardMaxBytes: 100 }), /limite/);
});

test('missing canvas support cannot silently return an oversized image', async t => {
  browser(t, { context: false });
  await assert.rejects(optimizeImageForUpload(file(101), { targetMaxBytes: 60, hardMaxBytes: 100 }), /limite/);
});

test('failed canvas encoding cannot silently return an oversized image', async t => {
  browser(t, { blobSize: null });
  await assert.rejects(optimizeImageForUpload(file(101), { targetMaxBytes: 60, hardMaxBytes: 100 }), /limite/);
});

test('an oversized encoded result is rejected instead of swallowed by catch', async t => {
  browser(t, { blobSize: 110 });
  await assert.rejects(optimizeImageForUpload(file(150), { targetMaxBytes: 60, hardMaxBytes: 100 }), /limite/);
});

test('compression retains valid MIME/extension and reports byte counts', async t => {
  browser(t);
  const result = await optimizeImageForUpload(file(150), { targetMaxBytes: 60, hardMaxBytes: 100 });
  assert.equal(result.optimized, true);
  assert.equal(result.file.type, 'image/webp');
  assert.equal(result.file.name, 'photo.webp');
  assert.equal(result.originalBytes, 150);
  assert.equal(result.finalBytes, 50);
});
