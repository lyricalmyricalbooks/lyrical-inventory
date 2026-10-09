import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

const block = (sel) => {
  // Earlier phone rules also style these selectors; join every match so the test
  // pins what the book-switcher block adds, wherever it sits.
  const re = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  const all = [...phone.matchAll(re)].map((m) => m[1]);
  expect(all.length, `rule for ${sel}`).toBeGreaterThan(0);
  return all.join('\n');
};

test('phone book switcher is an inked, offset-shadow button that presses in', () => {
  const rest = block('.pub-shell #book-dropdown-btn');
  expect(rest).toMatch(/border-color:\s*var\(--on-inverse-3\)/);
  expect(rest).toMatch(/box-shadow:\s*3px 3px 0/);
  expect(rest).toMatch(/text-transform:\s*uppercase/);
  expect(rest).toMatch(/var\(--ease-spring\)/);
  expect(block('.pub-shell #book-dropdown-btn:active')).toMatch(/translate\(3px, 3px\)[\s\S]*box-shadow:\s*none/);
  expect(block('.pub-shell #book-dropdown-btn:hover')).toMatch(/transform:\s*none/);
});

test('phone book switcher keeps a visible caret and focus ring', () => {
  expect(block('.pub-shell #book-dropdown-btn .book-dropdown-caret')).toMatch(/opacity:\s*\.85/);
  expect(block('.pub-shell #book-dropdown-btn:focus-visible')).toMatch(/outline:\s*2px solid var\(--gold\)/);
});
