import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductImageUploader, PRODUCT_IMAGE_MAX_BYTES } from '../lib/productImageStorage.js';

const picture = (name = 'foto.png', type = 'image/png', size = 100) => ({ name, type, size });
function harness(options = {}) {
  const calls = [];
  let serial = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const bucket = {
    async upload(path, file, config) {
      calls.push(['upload', path, file, config]);
      inFlight++;
      maxInFlight = Math.max(inFlight, maxInFlight);
      await Promise.resolve();
      inFlight--;
      return { error: options.failAt === calls.filter(c => c[0] === 'upload').length ? options.uploadError || new Error('failed') : null };
    },
    getPublicUrl(path) { return { data: { publicUrl: options.badUrl ? '' : `https://milmoldes.duckdns.org/storage/v1/object/public/product_images/${path}` } }; },
    async remove(paths) { calls.push(['remove', paths]); return { error: options.cleanupError }; },
  };
  const upload = createProductImageUploader({
    supabase: { storage: { from(name) { assert.equal(name, 'product_images'); return bucket; } } },
    optimizeImageForUpload: options.optimize || (async file => ({ file })),
    createId: () => `id-${++serial}`,
    folder: options.folder,
  });
  return { upload, calls, maxInFlight: () => maxInFlight };
}

test('product uploads are sequential, preserve order and use unique MIME-specific paths without overwrites', async () => {
  const h = harness();
  const urls = await h.upload([picture('original.jpg'), picture('second.png', 'image/webp')]);
  assert.equal(h.maxInFlight(), 1);
  assert.match(urls[0], /public\/id-1\.png$/);
  assert.match(urls[1], /public\/id-2\.webp$/);
  for (const [, , file, config] of h.calls) {
    assert.equal(config.upsert, false);
    assert.equal(config.contentType, file.type);
  }
});

test('all images are validated before any network write', async () => {
  const h = harness();
  await assert.rejects(h.upload([picture(), picture('large.gif', 'image/gif', PRODUCT_IMAGE_MAX_BYTES + 1)]), /4.2 MB/);
  assert.deepEqual(h.calls, []);
});

test('optimization may reduce a large original before size enforcement', async () => {
  const h = harness({ optimize: async file => ({ file: { ...file, size: 50, type: 'image/webp' } }) });
  await h.upload([picture('large.png', 'image/png', PRODUCT_IMAGE_MAX_BYTES * 2)]);
  assert.equal(h.calls[0][2].size, 50);
  assert.equal(h.calls[0][3].contentType, 'image/webp');
});

test('invalid, empty and non-image files never reach Storage', async () => {
  for (const file of [picture('x.txt', 'text/plain'), picture('x.png', 'image/png', 0), picture('x.png', 'image/png', NaN)]) {
    const h = harness();
    await assert.rejects(h.upload([file]));
    assert.deepEqual(h.calls, []);
  }
});

test('empty batch does not access Storage', async () => {
  const h = harness();
  assert.deepEqual(await h.upload([]), []);
  assert.deepEqual(h.calls, []);
});

test('a partial batch failure stops further uploads and removes only its confirmed unique paths', async () => {
  const h = harness({ failAt: 2 });
  await assert.rejects(h.upload([picture(), picture(), picture()]), /failed/);
  assert.deepEqual(h.calls.map(c => c[0]), ['upload', 'upload', 'remove']);
  assert.deepEqual(h.calls[2][1], ['public/id-1.png']);
});

test('504 does not trigger blind retries or return a fabricated URL', async () => {
  const h = harness({ failAt: 1, uploadError: { statusCode: '504', message: 'upstream request timeout' } });
  await assert.rejects(h.upload([picture()]), /HTTP 504/);
  assert.equal(h.calls.length, 1);
});

test('RLS errors explain session/policies without changing permissions', async () => {
  const h = harness({ failAt: 1, uploadError: { message: 'new row violates row-level security policy' } });
  await assert.rejects(h.upload([picture()]), /politicas/);
  assert.equal(h.calls.length, 1);
});

test('cleanup errors are reported with the upload failure', async () => {
  const h = harness({ failAt: 2, cleanupError: new Error('denied') });
  await assert.rejects(h.upload([picture(), picture()]), /limpieza/);
});

test('an invalid public URL aborts and cleans the confirmed object', async () => {
  const h = harness({ badUrl: true });
  await assert.rejects(h.upload([picture()]), /URL publica/);
  assert.deepEqual(h.calls[1], ['remove', ['public/id-1.png']]);
});

test('packs and store logos keep separate folders, MIME types and immutable object names', async () => {
  for (const folder of ['packs','store']) {
    const h = harness({ folder });
    const [url] = await h.upload([picture()]);
    assert.ok(url.endsWith(`/${folder}/id-1.png`));
    assert.equal(h.calls[0][3].upsert, false);
  }
  assert.throws(() => harness({ folder: '../perfiles' }), /no permitida/);
});
