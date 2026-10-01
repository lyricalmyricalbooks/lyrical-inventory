import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const dark = readFileSync(path.join(__dirname, '../src/styles/theme-dark.css'), 'utf8');

// Match the Riso block (after its marker comment), not the older layout rules that share selectors.
const rule = (css, sel) => {
  const start = css.includes('The "More" sheet on a phone') ? css.indexOf('The "More" sheet on a phone') : 0;
  const i = css.indexOf(sel + ' {', start);
  expect(i).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

test('phone More sheet tiles are inked, offset-shadowed slips that press in', () => {
  const tile = rule(phone, '.pub-shell .more-sheet-body .snav');
  expect(tile).toMatch(/border:\s*var\(--stroke\)\s+solid\s+var\(--rule-ink\)/);
  expect(tile).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  expect(rule(phone, '.pub-shell .more-sheet-body .snav:active')).toMatch(/translate\(1px, 1px\)/);
});

test('the current page tile is inked in, and night mode steps it up instead', () => {
  expect(rule(phone, '.pub-shell .more-sheet-body .snav.active')).toMatch(/background:\s*var\(--surface-inverse\)/);
  expect(rule(dark, '.theme-dark .pub-shell .more-sheet-body .snav.active')).toMatch(/var\(--cream4\)/);
});

test('the close button is square, not a round dot', () => {
  expect(rule(phone, '.pub-shell .more-sheet-close')).toMatch(/border-radius:\s*var\(--r2\)/);
});
