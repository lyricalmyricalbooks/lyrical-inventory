import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('the phone record details button is a square, inked, caps button', () => {
  const rule = css.match(/:is\(\.tab-panel, \.modal\) \.phone-record-toggle\s*\{([\s\S]*?)\n\s*\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/border:\s*var\(--stroke\)\s+solid\s+var\(--rule-ink\)/);
  expect(rule[1]).toMatch(/border-radius:\s*var\(--r2\)/);
  expect(rule[1]).toMatch(/text-transform:\s*uppercase/);
  expect(rule[1]).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  expect(css).toMatch(/:is\(\.tab-panel, \.modal\) \.phone-record-toggle:active\s*\{[^}]*translate/);
});
