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

test('"Today so far" is an inked slip over the shared upload pill', () => {
  const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  expect(html).toMatch(/<button type="button" class="today-sold" id="today-sold" onclick="switchTab\('history'\)">/);
  // Announced politely, so a screen reader hears the upload status change.
  expect(html).toMatch(/<span class="fm-sync today-sync" id="today-sync" role="status" aria-live="polite"><\/span>/);
  expect(phone).toMatch(/#tab-today \.today-sold \{[^}]*border: var\(--stroke\) solid var\(--rule-ink\); border-radius: var\(--r2\);[^}]*box-shadow: var\(--elev-1\)/);
  expect(phone).toMatch(/#tab-today \.today-sold:active \{ transform: translate\(2px, 2px\); box-shadow: none/);
  // Only on phones: the strip is hidden everywhere else.
  expect(phone).toMatch(/\.phone-eyebrow, \.today-sofar \{ display: none; \}/);
});
