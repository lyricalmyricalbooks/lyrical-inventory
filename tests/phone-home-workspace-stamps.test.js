import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone home workspace rows use one square inked stamp for every icon', () => {
  const rule = phone.match(/#tab-today \.today-row-ic\s*\{([\s\S]*?)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/width:\s*32px;/);
  expect(rule[1]).toMatch(/height:\s*32px;/);
  expect(rule[1]).toMatch(/flex:\s*0\s+0\s+32px;/);
  expect(rule[1]).toMatch(/border:\s*var\(--stroke\)\s+solid\s+currentColor;/);
});
