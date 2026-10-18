import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('on a phone each per-book mix card leads with its title and wears the inked frame', () => {
  const phone = styles.match(/@media\(max-width:640px\)\{\s*\.ch-book-grid[\s\S]*?\n\}/);
  expect(phone).not.toBeNull();
  expect(phone[0]).toMatch(/\.ch-book-card\{[^}]*var\(--rule-ink\)[^}]*var\(--elev-3\)/);
  expect(phone[0]).toMatch(/\.ch-book-title\{[^}]*var\(--font-display\)[^}]*var\(--text-xl\)/);
  expect(phone[0]).toMatch(/\.ch-book-title\{[^}]*min-width:0/);
});
