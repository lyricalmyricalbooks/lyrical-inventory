import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone Manual entry keeps the currency picker and price on one row', () => {
  const block = phone.match(/#tab-manual \.price-inline\s*\{([^}]*)\}/);
  expect(block).not.toBeNull();
  expect(block[1]).toMatch(/grid-template-columns:\s*minmax\(9\.5rem,\s*54%\)\s+minmax\(0,\s*1fr\)/);
});
