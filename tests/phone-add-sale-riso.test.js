import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('Add Sale phone options are ink-outlined with the offset shadow', () => {
  expect(phone).toMatch(/:is\(\.phone-mode-opt, \.phone-seg-opt\) \{\s*border: var\(--stroke\) solid var\(--rule-ink\)/);
  expect(phone).toMatch(/box-shadow: var\(--elev-1\)/);
});

test('they press into the shadow when tapped', () => {
  expect(phone).toMatch(/:is\(\.phone-mode-opt, \.phone-seg-opt\):active \{ transform: translate\(2px, 2px\); box-shadow: none/);
});

test('the Sale / Gift switch drops its grey well', () => {
  expect(phone).toMatch(/#tab-manual \.phone-mode-seg \{[^}]*background: transparent/);
});
