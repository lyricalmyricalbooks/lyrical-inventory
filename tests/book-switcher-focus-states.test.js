import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// See book-strip-kpi-alignment.test.js for why __dirname is resolved this way
// rather than `new URL(..., import.meta.url)` under jsdom.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('book switcher trigger no longer suppresses its own focus ring', () => {
  // The old markup set `outline:none` inline with no replacement, so tabbing
  // to the app's most-used control showed no focus indicator at all.
  const trigger = html.match(/<button id="book-dropdown-btn"[^>]*>/);
  expect(trigger).not.toBeNull();
  expect(trigger[0]).not.toMatch(/outline\s*:\s*none/);
  expect(trigger[0]).toMatch(/class="book-dropdown-btn"/);

  const btnRule = styles.match(/\.book-dropdown-btn\s*\{([\s\S]*?)\n\}/);
  expect(btnRule).not.toBeNull();
  expect(btnRule[1]).not.toMatch(/outline\s*:\s*none/);
  expect(styles).toMatch(/\.book-dropdown-btn:hover\{[^}]*border-color:var\(--gold\)/);
});

test('book dropdown open state is driven by a class, not an inline style write', () => {
  const menuRule = styles.match(/\.book-dropdown-menu\s*\{([\s\S]*?)\n\}/);
  expect(menuRule).not.toBeNull();
  expect(menuRule[1]).toMatch(/display:\s*none;/);
  expect(styles).toMatch(/#book-dropdown\.open \.book-dropdown-menu\{display:block/);

  // toggleBookDropdown/closeBookDropdown must flip the wrapper's class, never
  // reach into the menu's own style.display (that was the old, state-less way).
  expect(mainJs).toMatch(/wrap\.classList\.add\('open'\)/);
  expect(mainJs).toMatch(/wrap\.classList\.remove\('open'\)/);
});

test('book switcher options render as real buttons with a considered focus state', () => {
  const buildFn = mainJs.match(/function buildBookSwitcher\(\)[\s\S]*?\n\}/);
  expect(buildFn).not.toBeNull();
  // Divs with onmouseover/onmouseout are not keyboard-focusable at all.
  expect(buildFn[0]).toMatch(/document\.createElement\('button'\)/);
  expect(buildFn[0]).not.toMatch(/onmouseover/);
  expect(buildFn[0]).not.toMatch(/onmouseout/);
  expect(buildFn[0]).toMatch(/role', 'option'/);

  // The menu clips overflow, so the item's focus ring must be inset or it
  // gets clipped on the first/last row instead of just using the app-wide
  // outline-based ring.
  const itemFocusRule = styles.match(/\.book-dd-item:focus-visible\{([^}]*)\}/);
  expect(itemFocusRule).not.toBeNull();
  expect(itemFocusRule[1]).toMatch(/box-shadow:\s*inset 0 0 0 var\(--focus-ring-width\) var\(--focus-ring-color\)/);
});

test('switching books toggles the active class instead of overwriting inline color/background', () => {
  const highlightBlock = mainJs.match(/document\.querySelectorAll\('\.book-dd-item'\)\.forEach\(el => \{([\s\S]*?)\n {2}\}\);/);
  expect(highlightBlock).not.toBeNull();
  expect(highlightBlock[1]).toMatch(/el\.classList\.toggle\('active', isActive\)/);
  expect(highlightBlock[1]).not.toMatch(/el\.style\.color/);
  expect(highlightBlock[1]).not.toMatch(/el\.style\.background/);
});
