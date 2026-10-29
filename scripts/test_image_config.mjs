import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { hasRemoteMatch } = require('next/dist/shared/lib/match-remote-pattern');
const { getImgProps } = require('next/dist/shared/lib/get-img-props');
const { imageConfigDefault } = require('next/dist/shared/lib/image-config');
const defaultLoader = require('next/dist/shared/lib/image-loader').default;

test('image configuration supports hosted storage and Dell origins without broad host access', async () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalStorage = process.env.NEXT_PUBLIC_STORAGE_URL;
  delete process.env.NEXT_PUBLIC_STORAGE_URL;
  try {
    for (const [index, origin] of [
      'https://example.supabase.co',
      'https://storage.example.test:8443',
      'http://192.168.1.50:8000',
      'https://example.test/supabase/',
    ].entries()) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
      const { default: config } = await import(`../next.config.ts?image-test=${index}`);
      const imageUrl = `${origin.replace(/\/$/, '')}/storage/v1/object/public/productos/test.jpg`;
      assert.ok(hasRemoteMatch([], config.images.remotePatterns, new URL(imageUrl)), origin);
      assert.equal(hasRemoteMatch([], config.images.remotePatterns, new URL('https://unrelated.test/storage/v1/object/public/test.jpg')), false);
      assert.equal(hasRemoteMatch([], config.images.remotePatterns, new URL(`${origin.replace(/\/$/, '')}/rest/v1/productos`)), false);
      for (const quality of [75, 94, 95, 96, 99]) {
        const { props } = getImgProps({ src: imageUrl, alt: 'test', width: 56, height: 56, quality }, {
          defaultLoader,
          imgConf: { ...imageConfigDefault, ...config.images },
        });
        assert.equal(new URL(props.src, 'https://app.test').searchParams.get('q'), String(quality));
      }
    }
  } finally {
    if (originalStorage === undefined) delete process.env.NEXT_PUBLIC_STORAGE_URL;
    else process.env.NEXT_PUBLIC_STORAGE_URL = originalStorage;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});
