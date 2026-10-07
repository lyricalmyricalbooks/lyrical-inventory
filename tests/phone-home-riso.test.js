import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('home cards have the ink outline and offset shadow', () => {
  expect(phone).toMatch(/#tab-today \.today-card \{ border: var\(--stroke\) solid var\(--rule-ink\); box-shadow: var\(--elev-1\)/);
});

test('home cards press into the shadow instead of shrinking', () => {
  expect(phone).toMatch(/#tab-today \.today-card:active \{ transform: translate\(2px, 2px\); box-shadow: none/);
});

test('the gold card keeps the ink outline rather than a gold one', () => {
  expect(phone).toMatch(/#tab-today \.today-card-ink \{ border-color: var\(--rule-ink\)/);
});

test('the count badge is a square stamp, not a pill', () => {
  expect(phone).toMatch(/#tab-today \.today-card-count \{[^}]*border-radius: var\(--r2\)/);
});
