import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Eight phone layout bugs found on the 375px screenshots: squeezed to-do copy,
// a toolbar that overflowed and left an empty gap, three tables cut off at the
// right edge, an empty search box and a visible "Clear search", a warning sign
// that ignored [hidden], a light header strip on night sheets, and an import
// button enabled with nothing to import.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const phone = read('src/styles/phone.css');
const style = read('src/style.css');
const dark = read('src/styles/theme-dark.css');
const html = read('index.html');
const layout = read('src/lib/phone-layout.js');
const main = read('src/main.js');

test('to-do rows stack on a phone: copy beside the icon, actions on their own line, dismiss in the corner', () => {
  expect(phone).toMatch(/\.todo-row \{\s*position: relative;\s*display: grid;\s*grid-template-columns: auto minmax\(0, 1fr\);/);
  expect(phone).toMatch(/\.todo-copy \{ grid-column: 2; grid-row: 1;/);
  expect(phone).toMatch(/\.todo-row-actions \{\s*grid-column: 1 \/ -1; grid-row: 2;/);
  expect(phone).toMatch(/\.todo-row-actions > \.btn \{ width: 100%;/);
  expect(phone).toMatch(/\.todo-dismiss \{ position: absolute; top: var\(--space-1\); right: var\(--space-1\); \}/);
});

test('the combined consignment toolbar drops its 220px search basis and sets its filter tabs as equal columns on a phone', () => {
  expect(phone).toMatch(/\.con-toolbar-search \{ flex: none; width: 100%; min-width: 0; max-width: none; \}/);
  expect(phone).toMatch(/\.con-toolbar-filters \{ display: grid; grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\);/);
  expect(phone).toMatch(/\.con-filter-btn \{ justify-content: center; flex-wrap: wrap;/);
  expect(phone).toMatch(/\.con-toolbar-actions > \.con-group-toggle-btn \{ flex: 1 1 100%;/);
});

test('the Dashboard channel table is a phone record list keyed on its real columns', () => {
  // Headers: 0 Channel, 1 Transactions, 2 Units, 3 Revenue, 4 Share.
  const head = html.match(/<table class="tbl ch-mix-tbl"><thead><tr>([\s\S]*?)<\/tr><\/thead><tbody id="ch-body">/);
  expect(head).not.toBeNull();
  const headers = [...head[1].matchAll(/<th\b[^>]*>(?:Channel|Transactions|Units|Revenue|Share)/g)].map(m => m[0].replace(/^.*>/, ''));
  expect(headers).toEqual(['Channel', 'Transactions', 'Units', 'Revenue', 'Share']);
  expect(layout).toMatch(/'ch-body': \{ lead: 0, summary: \[2, 3, 4\] \}/);
});

test('the Tax Centre category and trip totals are phone record lists keyed on their real columns', () => {
  // Category headers: 0 Tax Category, 1 Txns, 2 % of Total, 3 Total Deductible (CAD).
  expect(html).toMatch(/<th>Tax Category<\/th><th class="r">Txns<\/th><th class="r">% of Total<\/th><th class="r">Total Deductible \(CAD\)<\/th>/);
  expect(layout).toMatch(/'tc-category-body': \{ lead: 0, summary: \[1, 3\] \}/);
  // Trip headers: 0 Trip, 1 Expenses, 2 Total (CAD).
  expect(html).toMatch(/<th>Trip<\/th><th class="r">Expenses<\/th><th class="r">Total \(CAD\)<\/th>/);
  expect(html).toMatch(/<tbody id="tc-trip-body">/);
  expect(layout).toMatch(/'tc-trip-body': \{ lead: 0, summary: \[1, 2\] \}/);
});

test('the history order search stops reserving a 260px height once its bar stacks', () => {
  expect(style).toMatch(/@container \(max-width: 560px\) \{[\s\S]*?\.hist-search-field \{\s*flex: 0 0 auto;\s*\}/);
});

test('the history "Clear search" button stays hidden while it carries the hidden attribute', () => {
  expect(html).toMatch(/<button type="button" class="btn sm" id="hist-search-clear" onclick="clearHistSearch\(\)" hidden>/);
  expect(style).toMatch(/\.ledger-filter-row > \.btn\[hidden\] \{\s*display: none;\s*\}/);
});

test('a hidden field warning draws no warning sign', () => {
  expect(html).toMatch(/<div id="sl-country-hint" class="field-warn" hidden><\/div>/);
  expect(style).toMatch(/\.field-warn\[hidden\]\{display:none;\}/);
});

test('night-mode sheets fill the pinned title and footer with the sheet colour, not the page colour', () => {
  expect(dark).toMatch(/\.theme-dark \.modal-title,\s*\.theme-dark \.modal-footer \{\s*background: var\(--surface-card\);\s*\}/);
  expect(dark).toMatch(/\.theme-dark \.modal-title::after \{\s*background: linear-gradient\(to bottom, var\(--surface-card\), transparent\);\s*\}/);
  expect(dark).toMatch(/\.theme-dark \.modal-footer::before \{\s*background: linear-gradient\(to top, var\(--surface-card\), transparent\);\s*\}/);
});

test('the import confirm button starts disabled, with the hint shown, until a file is read', () => {
  expect(html).toMatch(/<button class="btn gold" id="import-confirm-btn" onclick="confirmImport\(\)" disabled>/);
  expect(html).toMatch(/<p id="import-empty-hint" class="import-empty-hint">Choose a file to see its orders here<\/p>/);
  expect(main).toMatch(/function setImportReady\(ready\) \{/);
  expect(main).toMatch(/setImportReady\(_importRows\.length > 0\);/);
  expect(main).toMatch(/_importRows = \[\];\s*setImportReady\(false\);/);
  // The Sheets restore path reuses the same pop-up and must stay enabled.
  expect(main).toMatch(/Restore database \(\$\{recordRows\.length\} rows\)`;\s*\}\s*setImportReady\(true\);/);
});
