import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

const block = (re) => styles.match(re)?.[1] ?? '';

test('carrier tiles lay out by the group width, never two plus an orphan', () => {
  expect(block(/\.ship-flow-group\s*\{([^}]*)\}/)).toMatch(/container:\s*ship-carriers\s*\/\s*inline-size/);
  // The old auto-fit grid wrapped three tiles into a row of two and a lone third.
  expect(block(/\.ship-carrier-grid\s*\{([^}]*)\}/)).not.toMatch(/auto-fit/);

  const two = styles.match(/@container ship-carriers \(min-width:\s*360px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  expect(two).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  expect(two).toMatch(/\.ship-carrier:first-child\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);

  const three = styles.match(/@container ship-carriers \(min-width:\s*600px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  expect(three).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  expect(three).toMatch(/\.ship-carrier:first-child\s*\{\s*grid-column:\s*auto;/);
});

test('a quoted price leads its tile, two steps above the carrier name', () => {
  expect(block(/\.ship-carrier-name\s*\{([^}]*)\}/)).toMatch(/font-size:\s*var\(--text-sm\)/);
  const price = block(/\.ship-carrier-price\s*\{([^}]*)\}/);
  expect(price).toMatch(/font-family:\s*var\(--font-mono\)/);
  expect(price).toMatch(/font-size:\s*var\(--text-lg\)/);
  expect(price).toMatch(/font-variant-numeric:\s*tabular-nums/);
});
