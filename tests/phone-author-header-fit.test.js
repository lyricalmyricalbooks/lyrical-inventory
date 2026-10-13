import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Author view on a phone: the grouped header menus get a 96px floor so three
// fit a row, and the account menu (just the round avatar) inherited it. That
// pushed the header 3px past a 375px screen, so every author-view screen
// scrolled sideways. The account menu now sizes to its avatar.
const css = readFileSync(`${process.cwd()}/src/style.css`, 'utf8');

test('the account menu is exempt from the grouped menus’ 96px floor', () => {
  expect(css).toMatch(/\.header-menu\{flex:1 1 calc\(33\.333% - 4px\);min-width:96px;/);
  expect(css).toMatch(/#hmenu-account\.header-menu\{flex:0 0 auto;min-width:var\(--target-min\);\}/);
});
