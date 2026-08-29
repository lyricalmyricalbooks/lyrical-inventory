import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const shippingSource = readFileSync(path.join(__dirname, '../src/features/shipping.js'), 'utf8');

test('Canada Post rate price uses the same mono treatment as the Shippo rate price', () => {
  const cpPrice = styles.match(/\.cp-rate-price\s*\{([\s\S]*?)\n\}/);
  const shippoPrice = styles.match(/\.rate-price\s*\{([\s\S]*?)\n\}/);

  expect(cpPrice).not.toBeNull();
  expect(shippoPrice).not.toBeNull();
  expect(cpPrice[1]).toMatch(/font-family:\s*'DM Mono',\s*monospace;/);
  expect(shippoPrice[1]).toMatch(/font-family:\s*'DM Mono',\s*monospace;/);
  // Same headline size as the sibling carrier's rate price, so the two lists read as one system.
  expect(cpPrice[1]).toMatch(/font-size:\s*var\(--text-lg\);/);
  // DM Mono ships only at 400/500 — a heavier request synthesises and smears the digits.
  expect(cpPrice[1]).toMatch(/font-weight:\s*500;/);
});

test('the Canada Post rate row markup uses the class instead of the dead .tnum + inline styles', () => {
  expect(shippingSource).toMatch(/<strong class="cp-rate-price">\$\{q\.totalPrice\.toFixed\(2\)\} CAD<\/strong>/);
  expect(shippingSource).not.toMatch(/class="tnum" style="font-size:15px/);
});
