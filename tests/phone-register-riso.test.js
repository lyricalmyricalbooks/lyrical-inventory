import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('register tiles and buttons carry the offset shadow', () => {
  expect(phone).toMatch(/\.fm-tile-add, \.fm-today-btn, \.fm-pay-btn, \.fm-undo-btn \{ box-shadow: var\(--elev-1\)/);
});

test('they press into the shadow instead of scaling', () => {
  expect(phone).toMatch(/\.fm-undo-btn\):active:not\(:disabled\) \{ transform: translate\(2px, 2px\); box-shadow: none/);
});

test('an in-cart tile keeps the ink outline', () => {
  expect(phone).toMatch(/\.fm-tile\.is-in-cart \.fm-tile-add \{ border-color: var\(--rule-ink\)/);
});
