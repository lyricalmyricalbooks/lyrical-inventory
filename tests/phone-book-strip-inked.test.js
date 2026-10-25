import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone book cards are inked slabs with the offset shadow and no touch lift', () => {
  const rule = phone.match(/\n\s*\.book-strip \{([^}]*)\}/);
  const hover = phone.match(/\n\s*\.book-strip:hover \{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/border:\s*var\(--stroke\) solid var\(--rule-ink\)/);
  expect(rule[1]).toMatch(/border-radius:\s*var\(--r2\)/);
  expect(rule[1]).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  expect(hover[1]).toMatch(/transform:\s*none/);
});
