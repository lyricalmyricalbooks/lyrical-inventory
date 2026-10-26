import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('the phone book banner is an inked slab whose book colour sits inside the outline', () => {
  const rule = phone.match(/\n\s*\.book-context\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/border:\s*var\(--stroke\)\s+solid\s+var\(--rule-ink\)/);
  expect(rule[1]).toMatch(/box-shadow:\s*var\(--elev-1\),\s*inset 4px 0 0 var\(--book-accent\)/);
  expect(rule[1]).toMatch(/background:\s*var\(--surface-card\)/);
});

test('the book name leads in display lettering', () => {
  const title = phone.match(/\n\s*\.book-context-title\s*\{([^}]*)\}/);
  expect(title).not.toBeNull();
  expect(title[1]).toMatch(/font-family:\s*var\(--font-display\)/);
  expect(title[1]).toMatch(/text-transform:\s*uppercase/);
});

test('Order History keeps one big title on a phone: the second heading is visually hidden, not removed', () => {
  const riso = readFileSync(path.join(__dirname, '../src/styles/phone-riso.css'), 'utf8');
  const rule = riso.match(/\.pub-shell #tab-history > \.row-between > \.section-hed\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/position:\s*absolute/);
  expect(rule[1]).toMatch(/clip-path:\s*inset\(50%\)/);
  expect(rule[1]).not.toMatch(/display:\s*none/);
});
