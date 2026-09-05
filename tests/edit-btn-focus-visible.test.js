import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('a keyboard-focused edit button is not left invisible', () => {
  const base = styles.match(/\.edit-btn\{([\s\S]*?)\}/);
  const focus = styles.match(/\.edit-btn:focus-visible\{([\s\S]*?)\}/);

  expect(base).not.toBeNull();
  // The row-hover reveal this bug hides behind — opacity:0 at rest.
  expect(base[1]).toMatch(/opacity:0;/);

  expect(focus).not.toBeNull();
  // Must override the base opacity:0, or the button (and any outline on it)
  // renders fully invisible when a keyboard user tabs to it without also
  // hovering the row.
  expect(focus[1]).toMatch(/opacity:1;/);
  expect(focus[1]).toMatch(/outline:\s*var\(--focus-ring-width\)\s*solid\s*var\(--focus-ring-color\);/);
});
