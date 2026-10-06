import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const rule = (sel) => {
  const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
  const all = [...phone.matchAll(re)];
  expect(all.length, sel).toBeGreaterThan(0);
  return all.map((m) => m[1]).join(' ');
};

test('More sheet tiles are outlined, offset-shadowed and press in', () => {
  const tile = rule('.pub-shell .more-sheet-body .snav');
  expect(tile).toMatch(/border:\s*var\(--stroke\) solid var\(--rule-ink\)/);
  expect(tile).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  expect(rule('.pub-shell .more-sheet-body .snav:active')).toMatch(/translate\(2px, 2px\)/);
});

test('the current More-sheet screen is inked in, not ringed in gold', () => {
  const active = rule('.pub-shell .more-sheet-body .snav.active');
  expect(active).toMatch(/background:\s*var\(--surface-inverse\)/);
  expect(active).toMatch(/color:\s*var\(--content-on-inverse\)/);
});

test('the close button is square and outlined', () => {
  const close = rule('.more-sheet-close');
  expect(close).toMatch(/border-radius:\s*var\(--r2\)/);
  expect(close).toMatch(/solid var\(--rule-ink\)/);
});
