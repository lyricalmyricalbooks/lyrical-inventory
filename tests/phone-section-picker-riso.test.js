import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const block = phone.slice(phone.indexOf('Section picker on a phone, Riso Press'));

test('the phone section picker is an ink-outlined slip with the offset shadow', () => {
  expect(block).toMatch(/\.phone-section-picker select \{[^}]*border: var\(--stroke\) solid var\(--rule-ink\)/);
  expect(block).toMatch(/\.phone-section-picker select \{[^}]*box-shadow: var\(--elev-1\)/);
});

test('it keeps room for the arrow so long names do not run under it', () => {
  expect(block).toMatch(/\.phone-section-picker select \{\s*padding-right: 40px/);
});

test('it presses in when tapped and keeps a focus ring', () => {
  expect(block).toMatch(/select:active \{ transform: translate\(2px, 2px\); box-shadow: none/);
  expect(block).toMatch(/select:focus-visible \{[^}]*--focus-ring-halo/);
});
