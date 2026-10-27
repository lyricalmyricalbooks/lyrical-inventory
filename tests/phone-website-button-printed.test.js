import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone header Website button matches the book picker: offset shadow, caps, press-in', () => {
  const rest = phone.match(/\.pub-shell \.app-header \.app-switch-pill\s*\{([\s\S]*?)\n  \}/);
  const press = phone.match(/\.pub-shell \.app-header \.app-switch-pill:active\s*\{([^}]*)\}/);
  expect(rest).not.toBeNull();
  expect(press).not.toBeNull();
  expect(rest[1]).toMatch(/box-shadow:\s*3px 3px 0/);
  expect(rest[1]).toMatch(/text-transform:\s*uppercase/);
  expect(rest[1]).toMatch(/font-weight:\s*800/);
  expect(press[1]).toMatch(/translate\(3px,\s*3px\)/);
  expect(press[1]).toMatch(/box-shadow:\s*none/);
});

// Manual entry — Required tag and order total (phone)
const block = sel => {
  const m = phone.match(new RegExp(`\\n  ${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  expect(m, sel).not.toBeNull();
  return m[1];
};

test('phone "Required" tag is a square outlined caps tag, not a soft lozenge', () => {
  const rule = block('.req-badge');
  expect(rule).toMatch(/border-radius:\s*var\(--r2\)/);
  expect(rule).toMatch(/border:\s*var\(--stroke\) solid currentColor/);
});

test('phone Manual entry order total is an inked slab with the offset shadow', () => {
  const rule = block('#tab-manual .order-preview');
  expect(rule).toMatch(/border:\s*var\(--stroke\) solid var\(--rule-ink\)/);
  expect(rule).toMatch(/box-shadow:\s*var\(--elev-1\)/);
});

test('warning tints keep an edge stripe on the inked slab and the tag inside is square', () => {
  expect(block('#tab-manual .order-preview:has(.pill.amber)')).toMatch(/inset 4px 0 0 var\(--status-active\)/);
  expect(block('#tab-manual .order-preview:has(.pill.red)')).toMatch(/inset 4px 0 0 var\(--status-critical\)/);
  expect(block('#tab-manual .order-preview .pill')).toMatch(/border-radius:\s*var\(--r2\)/);
});
