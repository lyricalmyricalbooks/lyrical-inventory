import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone setup cards take the 2px ink outline and offset shadow', () => {
  const rule = phone.match(/\.tab-panel :is\(\.sheets-setup, \.sync-review-card\)\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/border:\s*var\(--stroke\)\s+solid\s+var\(--border-strong\)/);
  expect(rule[1]).toMatch(/box-shadow:\s*var\(--elev-1\)/);
});

test('the review card keeps its edge stripe on top of the shadow', () => {
  expect(phone).toMatch(/\.sync-review-card\.has-items\s*\{\s*box-shadow:\s*inset 3px 0 0 var\(--status-active\),\s*var\(--elev-1\)/);
});

test('phone status badge is a square tag, not a pill', () => {
  const rule = phone.match(/\.tab-panel \.sheets-badge\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/border-radius:\s*var\(--r2\)/);
});
