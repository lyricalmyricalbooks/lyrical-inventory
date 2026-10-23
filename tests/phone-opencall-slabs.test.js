import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('Open Call cards on a phone are inked slabs with the shared offset shadow', () => {
  const rule = phone.match(/#tab-opencall :is\(\.oc-topbar, \.oc-list-card, \.oc-settings-card\)\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/var\(--rule-ink\)/);
  expect(rule[1]).toMatch(/var\(--elev-2\)/);
});

test('Open Call search and sort boxes take the full width in a two-column grid', () => {
  expect(phone).toMatch(/#tab-opencall \.oc-list-toolbar \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  expect(phone).toMatch(/#tab-opencall \.oc-list-toolbar #oc-search \{ grid-column: 1 \/ -1; \}/);
  expect(phone).toMatch(/#tab-opencall \.oc-list-card \{ padding: 0; \}/);
});

test('Open Call project buttons share one full-width row', () => {
  expect(phone).toMatch(/#tab-opencall \.oc-topbar-actions \.btn \{ flex: 1 1 auto;/);
});
