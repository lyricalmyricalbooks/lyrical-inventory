import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&');
  const all = [...css.matchAll(new RegExp(`\\n  ${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  expect(all.length, `expected a rule for ${selector}`).toBeGreaterThan(0);
  return all.map((m) => m[1]).join(' ');
};

test('the section picker is an inked slip with the offset shadow', () => {
  const decl = rule('.phone-section-picker select');
  expect(decl).toMatch(/border:\s*var\(--stroke\) solid var\(--rule-ink\)/);
  expect(decl).toMatch(/box-shadow:\s*var\(--elev-1\)/);
});

test('the picker keeps room on the right for its arrow', () => {
  // A uniform padding shorthand used to reset this and slide long names under the arrow.
  expect(rule('.phone-section-picker select')).toMatch(/padding:\s*var\(--space-3\) 40px var\(--space-3\) var\(--space-4\)/);
  expect(css).not.toMatch(/\.phone-section-picker select \{ border-radius: var\(--r2\); padding: var\(--space-3\); \}/);
});

test('the picker presses in and shows focus', () => {
  expect(rule('.phone-section-picker select:active')).toMatch(/translate\(2px, 2px\)/);
  expect(rule('.phone-section-picker select:focus-visible')).toMatch(/outline:/);
});
