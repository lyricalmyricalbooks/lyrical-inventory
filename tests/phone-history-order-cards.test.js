import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone order history rows are inked, offset-shadow cards with the total leading', () => {
  const card = phone.match(/#tab-history \.tbl tr\.hist-row \{([\s\S]*?)\n  \}/);
  expect(card).not.toBeNull();
  expect(card[1]).toMatch(/border:\s*var\(--stroke\) solid var\(--rule-ink\)/);
  expect(phone).toMatch(/tr\.hist-row:not\(\.is-awaiting\) \{[^}]*box-shadow: var\(--elev-1\)/);
  expect(card[1]).toMatch(/margin-bottom:\s*var\(--space-3\)/);
  expect(phone).toMatch(/tr\.hist-row > td:nth-child\(5\) \{[^}]*font-weight: 800/);
  expect(phone).toMatch(/tr\.hist-row:active \{ transform: translate\(2px, 2px\)/);
});
