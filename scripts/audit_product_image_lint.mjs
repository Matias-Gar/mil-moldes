import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const eslint = new ESLint();
let failures = 0;
for (const filename of [
  'app/admin/productos/page.js', 'app/admin/productos/nuevo/page.js', 'app/admin/productos/editar/page.js',
  'app/admin/productos/archivar/page.js', 'app/admin/whatsapp/page.js', 'components/promociones/PacksClient.jsx',
]) {
  const baseline = execFileSync('git', ['show', `HEAD:${filename}`], { encoding: 'utf8' });
  const current = await readFile(filename, 'utf8');
  const [before] = await eslint.lintText(baseline, { filePath: filename });
  const [after] = await eslint.lintText(current, { filePath: filename });
  const signature = message => `${message.ruleId}:${message.message.split('\n')[0]}`;
  const original = new Set(before.messages.filter(m => m.severity === 2).map(signature));
  const added = after.messages.filter(m => m.severity === 2 && !original.has(signature(m)));
  failures += added.length;
  console.log(JSON.stringify({ file: filename, baselineErrors: before.errorCount, currentErrors: after.errorCount,
    newErrors: added.map(m => ({ rule: m.ruleId, line: m.line })) }));
}
process.exitCode = failures ? 1 : 0;
