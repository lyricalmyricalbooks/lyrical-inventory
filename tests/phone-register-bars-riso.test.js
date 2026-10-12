import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('the pinned Charge and Undo bars are square slabs', () => {
  expect(phone).toMatch(/\.fm-undo:not\(\[hidden\]\) \{ border-radius: var\(--r2\); \}/);
});

test('the undo check is an inked square stamp, not a green disc', () => {
  expect(phone).toMatch(/\.fm-undo-check \{ border-radius: var\(--r2\); border: var\(--stroke\) solid var\(--rule-ink\); box-shadow: var\(--elev-1\)/);
});

test('the bar total leads and the sheet labels are small caps', () => {
  expect(phone).toMatch(/\.fm-bar-total \{ font-size: var\(--text-xl\); font-variant-numeric: tabular-nums/);
  expect(phone).toMatch(/\.fm-pay-label \{[^}]*text-transform: uppercase/);
});
