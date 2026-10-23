import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone Expenses form keeps the currency picker and amount on one row', () => {
  const block = phone.match(/#tab-expenses \.price-inline\s*\{([^}]*)\}/);
  expect(block).not.toBeNull();
  expect(block[1]).toMatch(/grid-template-columns:\s*minmax\(5\.5rem,\s*30%\)\s+minmax\(0,\s*1fr\)/);
  expect(phone).toMatch(/#tab-expenses \.price-inline > \*\s*\{[^}]*min-width:\s*0/);
});
