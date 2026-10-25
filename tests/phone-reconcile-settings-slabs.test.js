import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone payment settings: key box and setting cards are inked slabs', () => {
  const key = phone.match(/#tab-reconcile \.recon-keyrow input \{\s*flex: 1 1 100%;([\s\S]*?)\n  \}/);
  const card = phone.match(/#tab-reconcile \.recon-fold-body \.toggle-row,\s*#tab-reconcile \.recon-fold-body \.sale-codes-box \{([\s\S]*?)\n  \}/);
  expect(key).not.toBeNull();
  expect(card).not.toBeNull();
  expect(key[1]).toMatch(/min-width: 0;/);
  expect(key[1]).toMatch(/border: var\(--stroke\) solid var\(--rule-ink\)/);
  expect(key[1]).toMatch(/padding: var\(--space-2\) var\(--space-3\)/);
  expect(card[1]).toMatch(/border: var\(--stroke\) solid var\(--rule-ink\)/);
  expect(card[1]).toMatch(/box-shadow: var\(--elev-1\)/);
});
