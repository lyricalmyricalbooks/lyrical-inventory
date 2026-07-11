import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const styles = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

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
