import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone store card gives On shelf more room than Sent and Sold, and Owed the most', () => {
  const block = phone.match(/#tab-consignment \.store-kpis \{\n([\s\S]*?)\n  \}/);
  expect(block).not.toBeNull();
  const fr = [...block[1].matchAll(/minmax\(0,\s*([\d.]+)fr\)/g)].map(m => parseFloat(m[1]));
  expect(fr).toHaveLength(4);
  expect(fr[2]).toBeGreaterThan(fr[0]);
  expect(fr[3]).toBeGreaterThan(fr[2]);
  expect(fr[0]).toBe(fr[1]);
});
