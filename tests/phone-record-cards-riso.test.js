import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

// The Riso rules come after the base card rules with the same selector, so the
// last one is the one that wins (and covers record cards in pop-ups too).
const last = (re) => [...css.matchAll(new RegExp(re.source, 'g'))].at(-1);

test('phone record cards use the Riso outline, offset shadow and micro-caps labels', () => {
  const card = last(/:is\(\.tab-panel, \.modal\) \.phone-records tr\.phone-record \{([^}]*)\}/);
  expect(card).toBeTruthy();
  expect(card[1]).toMatch(/border:\s*var\(--stroke\) solid var\(--border-strong\)/);
  expect(card[1]).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  expect(card[1]).toMatch(/margin-bottom:\s*var\(--space-4\)/);
  const label = last(/:is\(\.tab-panel, \.modal\) \.phone-records td::before \{([^}]*)\}/);
  expect(label[1]).toMatch(/text-transform:\s*uppercase/);
  expect(label[1]).toMatch(/var\(--text-2xs\)/);
});
