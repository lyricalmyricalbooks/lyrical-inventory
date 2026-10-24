import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');

test('the "More metrics" fold-out matches the inked KPI tiles and is a full-size tap row', () => {
  const box = styles.match(/\.kpi-more\s*\{([^}]*)\}/);
  const summary = styles.match(/\.kpi-more summary\s*\{([^}]*)\}/);
  expect(box).not.toBeNull();
  expect(summary).not.toBeNull();
  expect(box[1]).toMatch(/border:var\(--stroke\) solid var\(--rule-ink\)/);
  expect(box[1]).toMatch(/box-shadow:var\(--elev-2\)/);
  expect(summary[1]).toMatch(/min-height:44px/);
  expect(styles).toMatch(/\.kpi-more\[open\] summary::after\s*\{content:'−'/);
  expect(styles).toMatch(/\.kpi-more summary:focus-visible/);
});
