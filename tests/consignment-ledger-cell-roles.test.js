import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, p), 'utf8');
const main = read('../src/main.js');
const styles = read('../src/style.css');

// The consignment ledger row is one template literal in renderLedger().
const row = main.split('\n').find((l) => l.includes('html += `<tr class="${voided}">') && l.includes('e.storeName'));

test('the ledger row template is found', () => {
  expect(row).toBeTruthy();
});

test('dates use the shared date cell, so they hold one line in the figures font', () => {
  expect(row).toMatch(/<td class="date-cell">\$\{fmtD\(e\.date\)\}<\/td>/);
  expect(styles).toMatch(/\.tbl td\.date-cell\{[^}]*font-family:var\(--font-mono\);[^}]*white-space:nowrap;/);
});

test('the store leads the row and the amount uses the real mono weight', () => {
  expect(row).toMatch(/<td class="lead-cell">\$\{escapeHtml\(e\.storeName\)\}/);
  expect(row).toMatch(/<td class="r money-cell">\$\{e\.amountDue > 0/);
  // A synthesised 600 on DM Mono smears the digits; the shared cell is 500.
  expect(row).not.toMatch(/class="r" style="font-weight:600;"/);
});

test('on a computer the store keeps room to read in at most two lines', () => {
  expect(read('../index.html')).toMatch(/<table class="tbl con-ledger"><thead><tr><th>Date<\/th><th>Store<\/th>/);
  const start = styles.indexOf('@media (min-width: 769px){\n  .tbl.con-ledger');
  expect(start).toBeGreaterThan(-1);
  const block = styles.slice(start, styles.indexOf('\n}\n', start));
  expect(block).toMatch(/\.tbl\.con-ledger td\{padding-inline:12px;\}/);
  expect(block).toMatch(/:is\(th, td\):first-child\{padding-left:16px;\}/);
  expect(block).toMatch(/td\.lead-cell\{min-width:24ch;text-wrap:balance;\}/);
});
