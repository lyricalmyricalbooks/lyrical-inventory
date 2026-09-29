import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone record cards use the Riso outline, offset shadow and micro-caps labels', () => {
  const card = css.match(/\.tab-panel \.phone-records tr\.phone-record \{([^}]*)\}/);
  expect(card).not.toBeNull();
  expect(card[1]).toMatch(/border:\s*var\(--stroke\) solid var\(--border-strong\)/);
  expect(card[1]).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  expect(card[1]).toMatch(/margin-bottom:\s*var\(--space-4\)/);
  const label = css.match(/\.tab-panel \.phone-records td::before \{([^}]*)\}/);
  expect(label[1]).toMatch(/text-transform:\s*uppercase/);
  expect(label[1]).toMatch(/var\(--text-2xs\)/);
});
