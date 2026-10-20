import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const customersJs = readFileSync(path.join(__dirname, '../src/features/customers.js'), 'utf8');

// The buyer table's "+ List" and "Unsubscribe" used to wrap into a stack of two
// full-height buttons of different widths, doubling every row's height.
test('buyer row actions sit on one line inside a sized container', () => {
  expect(customersJs).toMatch(/<td class="cust-actions-cell"><div class="cust-actions">\$\{listBtn\}\$\{supBtn\}<\/div><\/td>/);
  expect(html).toMatch(/class="tbl-wrap sys-sticky-head cust-tbl-wrap"/);
  expect(styles).toMatch(/\.cust-tbl-wrap\{container:cust-table \/ inline-size;\}/);
  const row = styles.match(/\.cust-actions\{([\s\S]*?)\}/);
  expect(row).not.toBeNull();
  expect(row[1]).toMatch(/flex-wrap:nowrap/);
});

test('the table tightens its column gutters, not its outer edges, to make room', () => {
  expect(styles).toMatch(/@container cust-table \(min-width: 768px\)\{[\s\S]*?padding-inline:var\(--space-2\)/);
  expect(styles).toMatch(/\.cust-tbl-wrap \.tbl :is\(th, td\):first-child\{padding-left:var\(--space-4\);\}/);
});

test('when too narrow, the two actions stack at one shared width', () => {
  const narrow = styles.match(/@container cust-table \(min-width: 768px\) and \(max-width: 940px\)\{\s*\.cust-actions\{([^}]*)\}/);
  expect(narrow).not.toBeNull();
  expect(narrow[1]).toMatch(/flex-direction:column/);
  expect(narrow[1]).toMatch(/align-items:stretch/);
});

test('row buttons use the house small-button type, keeping the full tap height', () => {
  const btn = styles.match(/#cust-body \.btn,\s*#ml-body \.btn,\s*\.cust-action-btn\s*\{([\s\S]*?)\}/);
  expect(btn[1]).toMatch(/min-height:\s*var\(--target-min, 44px\)/);
  expect(btn[1]).toMatch(/font-size:\s*var\(--text-xs\)/);
  expect(btn[1]).not.toMatch(/font-weight:\s*600/);
});
