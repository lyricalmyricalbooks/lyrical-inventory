import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('Customers filter panel fills with a real themed surface, not an undefined token', () => {
  const filterGrid = styles.match(/\.cust-filter-grid\s*\{([\s\S]*?)\n\}/);

  expect(filterGrid).not.toBeNull();
  // `--cream-bg` was never defined anywhere in style.css/theme-dark.css, so the
  // background declaration silently fell back to transparent and the panel lost
  // its fill in both themes — assert the real, themed token instead.
  expect(filterGrid[1]).toMatch(/background:\s*var\(--surface-sunken\);/);
  expect(filterGrid[1]).not.toMatch(/--cream-bg/);
  expect(filterGrid[1]).toMatch(/border:\s*1px solid var\(--border-subtle\);/);
});
