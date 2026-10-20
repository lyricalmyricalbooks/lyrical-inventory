import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone dashboard numbers: lead and revenue span the row, the rest pair up', () => {
  const grid = phone.match(/\.kpi-grid-primary\s*\{([^}]*)\}/);
  const span = phone.match(/\.kpi-grid-primary > \.kpi\.is-lead,\s*\.kpi-grid-primary > \.kpi:nth-child\(2\)\s*\{([^}]*)\}/);
  expect(grid).not.toBeNull();
  // !important: the global phone rule collapses every kpi grid to one column with it.
  expect(grid[1]).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
  expect(span).not.toBeNull();
  expect(span[1]).toMatch(/grid-column:\s*1\s*\/\s*-1/);
});
