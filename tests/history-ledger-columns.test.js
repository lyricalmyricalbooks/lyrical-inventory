import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, p), 'utf8');
const styles = read('../src/style.css');
const html = read('../index.html');

// The desktop Order History rules live in one min-width block; pull it out so
// the assertions cannot be satisfied by a stray rule elsewhere in the sheet.
const block = (() => {
  const start = styles.indexOf('@media (min-width: 769px){\n  .tbl.hist-ledger');
  expect(start).toBeGreaterThan(-1);
  return styles.slice(start, styles.indexOf('\n}\n', start));
})();

test('the order history table carries the ledger hook', () => {
  expect(html).toMatch(/<table class="tbl hist-ledger"><thead><tr><th>Order #<\/th>/);
});

test('order numbers and dates hold one line on a computer', () => {
  expect(block).toMatch(/tr\.hist-row > td:nth-child\(1\),\s*\.tbl\.hist-ledger tr\.hist-row > td:nth-child\(9\)\{white-space:nowrap;/);
});

test('tight gutters keep the approve buttons in view, outer edges keep 16px', () => {
  expect(block).toMatch(/\.tbl\.hist-ledger th,\s*\.tbl\.hist-ledger td\{padding-inline:8px;\}/);
  expect(block).toMatch(/:is\(th, td\):first-child\{padding-left:16px;\}/);
  expect(block).toMatch(/:is\(th, td\):last-child\{padding-right:16px;\}/);
  // The short figure under "Stock after" should not hold the column open for its label.
  expect(block).toMatch(/th:nth-child\(6\)\{white-space:normal;\}/);
});

test('notes keep a readable minimum instead of a word per line', () => {
  expect(block).toMatch(/td:nth-child\(7\)\{min-width:12ch;text-wrap:pretty;\}/);
});
