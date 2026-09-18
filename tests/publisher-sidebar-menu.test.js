import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const styles = readFileSync(path.join(root, 'src/style.css'), 'utf8');

test('publisher account menu stays contained in the sidebar and keeps settings usable', () => {
  const menuRule = styles.match(/\.pub-shell \.pub-side-menu\{([\s\S]*?)\n  \}/);
  expect(menuRule).not.toBeNull();
  expect(menuRule[1]).toMatch(/box-sizing:border-box/);
  expect(menuRule[1]).toMatch(/overflow:hidden/);

  expect(styles).toMatch(/\.pub-shell \.theme-seg-row\{[\s\S]*?display:block;/);
  expect(styles).toMatch(/\.pub-shell \.theme-seg\{[\s\S]*?display:flex;[\s\S]*?width:100%;/);
  expect(styles).toMatch(/\.pub-shell \.theme-seg-opt\{[\s\S]*?flex:1 1 0;/);
});

test('publisher account actions preserve the minimum touch target', () => {
  const itemRule = styles.match(/\.pub-shell \.pub-side-item\{([\s\S]*?)\n  \}/);
  expect(itemRule).not.toBeNull();
  expect(itemRule[1]).toMatch(/min-height:44px/);
});
