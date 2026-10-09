import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

const block = (sel) => {
  const re = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  const all = [...phone.matchAll(re)].map((m) => m[1]);
  expect(all.length, `rule for ${sel}`).toBeGreaterThan(0);
  return all.join('\n');
};

test('phone header buttons are square, outlined, offset-shadow stamps', () => {
  const rest = block('.pub-shell .acct-avatar');
  expect(rest).toMatch(/border-radius:\s*var\(--r2\)/);
  expect(rest).toMatch(/border-color:\s*var\(--on-inverse-3\)/);
  expect(rest).toMatch(/box-shadow:\s*2px 2px 0/);
  expect(rest).toMatch(/var\(--ease-spring\)/);
});

test('phone header buttons press in and show a focus ring', () => {
  expect(block('.pub-shell .header-menu.open .acct-avatar')).toMatch(/translate\(2px, 2px\)[\s\S]*box-shadow:\s*none/);
  expect(block('.pub-shell .acct-trigger:focus-visible .acct-avatar')).toMatch(/outline:\s*2px solid var\(--gold\)/);
});
