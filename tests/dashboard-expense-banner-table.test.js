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
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

test('the dashboard expense-owed table has a real header row', () => {
  // The table used to be a bare <tbody> with no column labels at all.
  const wrap = html.match(/<table class="metric-banner-table">[\s\S]*?<\/table>/);
  expect(wrap).not.toBeNull();
  expect(wrap[0]).toContain('<thead>');
  expect(wrap[0]).toMatch(/<th class="r">Amount<\/th>/);
});

test('expense-owed rows share one padding rhythm and a row divider, not per-cell inline styles', () => {
  const bodyRule = styles.match(/\.metric-banner-table tbody td\s*\{([\s\S]*?)\n\}/);
  expect(bodyRule).not.toBeNull();
  expect(bodyRule[1]).toMatch(/padding:\s*7px 8px/);

  const dividerRule = styles.match(/\.metric-banner-table tbody tr\s*\{([\s\S]*?)\n\}/);
  expect(dividerRule).not.toBeNull();
  expect(dividerRule[1]).toMatch(/border-top:\s*var\(--stroke-hair\) solid/);

  const hoverRule = styles.match(/\.metric-banner-table tbody tr:hover td\s*\{([\s\S]*?)\n\}/);
  expect(hoverRule).not.toBeNull();

  // The renderer used to hand-pick padding/color per cell, disagreeing between
  // columns (flush on date/amount, 8px elsewhere) — now it only sets classes.
  const rowTemplate = mainJs.match(/\$\('d-exp-body'\)\.innerHTML = unreceivedExp\.map\(e => `([\s\S]*?)`\)\.join/);
  expect(rowTemplate).not.toBeNull();
  expect(rowTemplate[1]).not.toMatch(/style="padding/);
  expect(rowTemplate[1]).toContain('class="mb-desc"');
  expect(rowTemplate[1]).toContain('class="mb-amt"');
});

test('the category tag reuses one themed pill class instead of a hand-rolled inline badge', () => {
  const rule = styles.match(/\.metric-banner-cat\s*\{([\s\S]*?)\n\}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/border-radius:\s*var\(--r-pill\)/);

  const rowTemplate = mainJs.match(/\$\('d-exp-body'\)\.innerHTML = unreceivedExp\.map\(e => `([\s\S]*?)`\)\.join/);
  expect(rowTemplate[1]).toContain('class="metric-banner-cat"');
  expect(rowTemplate[1]).not.toMatch(/style="font-size:10px;background:rgba/);
});
