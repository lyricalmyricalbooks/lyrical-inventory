import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');

test('the receipt drop-zone remove buttons have a real accessible name, not just a title', () => {
  // Both buttons render only the glyph "×" as their text content, so without an
  // aria-label a screen reader announces that character instead of "Remove file" —
  // `title` alone never becomes the accessible name when the element has text content.
  const removeButtons = [...html.matchAll(/<button class="dz-remove"[^>]*>×<\/button>/g)].map((m) => m[0]);

  expect(removeButtons.length).toBe(2);
  for (const button of removeButtons) {
    expect(button).toMatch(/aria-label="Remove file"/);
  }
});
