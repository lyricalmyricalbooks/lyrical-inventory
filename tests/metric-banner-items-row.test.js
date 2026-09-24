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
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('metric-banner-items rows get a divider instead of running together', () => {
  const rowRule = styles.match(/\.metric-banner-items \.mbi-row\s*\{([\s\S]*?)\n\}/);
  expect(rowRule).not.toBeNull();
  expect(rowRule[1]).toMatch(/border-top:\s*var\(--stroke-hair\) solid/);

  const firstRule = styles.match(/\.metric-banner-items \.mbi-row:first-child\s*\{([\s\S]*?)\n\}/);
  expect(firstRule).not.toBeNull();
  expect(firstRule[1]).toMatch(/border-top:\s*none/);
});

test('the reimbursement amount uses the green ink token, not a raw hex', () => {
  // --green, not --emerald-soft: the banner is Riso paper now rather than a
  // permanently --ink block, so the amount takes the text-grade ink of the
  // family instead of the light-on-ink sibling. What this pins is the same —
  // a named token, never the raw #6ee7a8 this shipped with.
  expect(styles).toMatch(/\.metric-banner-green \.mbi-amt\s*\{\s*color:\s*var\(--green\);\s*\}/);
  expect(mainJs).not.toMatch(/color:#6ee7a8/);

  const arbBlock = mainJs.match(/\$\('arb-items'\)\.innerHTML = owed\.map\(e => `([\s\S]*?)`\)\.join/);
  expect(arbBlock).not.toBeNull();
  expect(arbBlock[1]).not.toMatch(/style="/);
  expect(arbBlock[1]).toContain('class="mbi-row"');
  expect(arbBlock[1]).toContain('class="metric-banner-cat"');
});

test('the artist and publisher transfer rows share one row component instead of two duplicated inline templates', () => {
  const apbBlock = mainJs.match(/\$\('apb-transfers'\)\.innerHTML = ([\s\S]*?)\.join\(''\)/);
  expect(apbBlock).not.toBeNull();
  expect(apbBlock[1]).not.toMatch(/style="/);
  expect(apbBlock[1]).toContain('mbi-row');
  expect(apbBlock[1]).toContain('is-pending');

  // --gold-text for the same reason as --green above: ink grade on paper.
  expect(styles).toMatch(/\.metric-banner-gold \.mbi-amt\s*\{\s*color:\s*var\(--gold-text\);\s*\}/);
  expect(styles).toMatch(/\.metric-banner-items \.mbi-row\.is-pending\s*\{\s*opacity:\s*\.6;\s*\}/);
});
