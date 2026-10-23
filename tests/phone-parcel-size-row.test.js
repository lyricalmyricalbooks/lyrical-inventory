import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone parcel size fields share rows instead of stacking one per row', () => {
  const grid = phone.match(/#tab-shipping \.phone-parcel-grid \{([^}]*)\}/);
  expect(grid).not.toBeNull();
  expect(grid[1]).toMatch(/repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
  expect(phone).toMatch(/\.phone-parcel-grid > \.form-group \{ grid-column: span 2;/);
  expect(phone).toMatch(/\.phone-parcel-grid > \.form-group:nth-child\(4\) \{ grid-column: 1 \/ -1; \}/);
});
