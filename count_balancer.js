/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = 'c:/Users/saita/catalogo/app/admin/ventas/nueva/page.js';
const code = fs.readFileSync(path, 'utf8');
const lines = code.split('\n');
let parens = 0;
let brace = 0;
let negativeReported=false;
for (let lineNum = 0; lineNum < lines.length; lineNum++) {
  const line = lines[lineNum];
  for (const c of line) {
    if (c === '(') parens++;
    if (c === ')') parens--;
    if (c === '{') brace++;
    if (c === '}') brace--;
  }
  if (lineNum >= 560 && lineNum <= 580) {
    // console.log('line', lineNum+1, 'parensCount', parens, 'text', line.trim());
  }
  if (parens < 0 && !negativeReported) {
    // console.log('negative parens at line', lineNum+1, 'text', line.trim());
    negativeReported=true;
  }
}
// console.log('final parens', parens, 'final braces', brace);
