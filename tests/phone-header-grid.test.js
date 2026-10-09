import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// phone.css loads last. Its header grid once had three columns while the header
// holds a brand and four buttons, so the bell and the account button were drawn
// in the same cell, one on top of the other.
test('phone header grid has a track for the brand and each of the four buttons', () => {
  const rule = phone.match(/\.pub-shell \.app-header\s*\{([\s\S]*?)\n\s*\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) repeat\(4, auto\);/);
});

test('each header button has its own column in the phone layer', () => {
  const ids = ['theme-toggle-btn', 'notif-header-btn', 'review-inbox-header-btn', 'hmenu-account'];
  const cols = ids.map((id) => {
    expect(html).toContain(`id="${id}"`);
    const m = phone.match(new RegExp(`\\.pub-shell #${id} \\{[^}]*grid-column: (\\d+);`));
    expect(m, id).not.toBeNull();
    return Number(m[1]);
  });
  expect(cols).toEqual([2, 3, 4, 5]);
});
