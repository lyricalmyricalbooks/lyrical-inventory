import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Passing a string
// keeps node's own parser in play, and matches how the rest of tests/ does it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('book overview KPI rails retain one shared width when a value is longer', () => {
  const kpiGrid = styles.match(/\.book-strip-kpis\s*\{([\s\S]*?)\n\}/);
  const kpiTile = styles.match(/\.bsk\s*\{([\s\S]*?)\n\}/);

  expect(kpiGrid).not.toBeNull();
  expect(kpiTile).not.toBeNull();
  expect(styles).toMatch(/--book-kpi-rail-width:\s*37rem;/);
  expect(kpiGrid[1]).toMatch(/flex:\s*0\s+0\s+var\(--book-kpi-rail-width\);/);
  expect(kpiGrid[1]).toMatch(/width:\s*var\(--book-kpi-rail-width\);/);
  expect(kpiGrid[1]).toMatch(/grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  expect(kpiTile[1]).toMatch(/min-width:\s*0;/);
});
