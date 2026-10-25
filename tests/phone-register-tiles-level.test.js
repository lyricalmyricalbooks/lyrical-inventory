import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone register tiles fill their grid row so prices sit level', () => {
  // Without display:flex the button shrinks to its content and a long title
  // leaves its neighbour short, with the two prices at different heights.
  expect(phone).toMatch(/\.fm-tile\s*\{[^}]*display:\s*flex/);
  expect(phone).toMatch(/\.fm-tile-price\s*\{[^}]*margin-top:\s*auto/);
});

test('phone register tiles: title in display lettering, price in mono figures', () => {
  const title = phone.match(/\.fm-tile-title\s*\{([^}]*)\}/);
  expect(title[1]).toMatch(/var\(--font-display\)/);
  expect(title[1]).toMatch(/text-transform:\s*uppercase/);
  const price = phone.match(/\.fm-tile-price\s*\{([^}]*)\}/);
  expect(price[1]).toMatch(/var\(--font-mono\)/);
  expect(price[1]).toMatch(/tabular-nums/);
});
