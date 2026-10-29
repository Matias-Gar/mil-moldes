import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
for (const route of ['forgot-password', 'validate-reset-code']) {
  test(`${route} rejects legacy password replacement without reading credentials or contacting Auth`, async () => {
    const source = readFileSync(new URL(`../app/api/auth/${route}/route.ts`, import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const compiledModule = { exports: {} };
    const imports = [];
    const restrictedRequire = name => {
      imports.push(name);
      assert.equal(name, 'next/server');
      return require(name);
    };
    new Function('require', 'module', 'exports', compiled)(restrictedRequire, compiledModule, compiledModule.exports);
    for (const payload of [{ email: 'test@example.invalid', newPassword: 'unused-test-password' }, { email: 'test@example.invalid', ci: '1234', code: '000000', nueva_contrasena: 'unused' }, {}]) {
      const request = new Request('https://mil-moldes.vercel.app/api/auth/' + route, { method: 'POST', body: JSON.stringify(payload) });
      request.json = () => { throw Error('Legacy credentials must never be read'); };
      const response = await compiledModule.exports.POST(request);
      assert.equal(response.status, 410);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).recoveryUrl, '/login');
    }
    assert.deepEqual(imports, ['next/server']);
  });
}
