import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// String assertions, like the other phone-* tests: the layout is CSS, and the
// order-card disclosure is one config line in phone-layout.js.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, rel), 'utf8');
const styles = read('../src/style.css');
const layout = read('../src/lib/phone-layout.js');

// The phone history block: from its comment to the end of its @media block.
const start = styles.indexOf('/* ---- History: each table row becomes a card ---- */');
const end = styles.indexOf('\n}\n', start);
const historyPhone = styles.slice(start, end);

test('the order card summary is order #, channel, total, date and the action; qty folds away', () => {
  expect(start).toBeGreaterThan(-1);
  // Indices into the Order History header: 0 order #, 1 channel (lead), 2 qty,
  // 3 unit price, 4 total, 5 stock after, 6 notes, 7 entered by, 8 date, 9 actions.
  expect(layout).toMatch(/'hist-body': \{ lead: 1, summary: \[0, 4, 8, 9\], card: true \}/);
});

test('amounts sit in one fixed-width right column on the card', () => {
  expect(historyPhone).toMatch(/grid-template-columns:minmax\(0,1fr\) 112px;/);
  expect(historyPhone).toMatch(/td:nth-child\(5\)\{grid-area:1 \/ 2 \/ 2 \/ 3 !important;text-align:right !important;\}/);
  expect(historyPhone).toMatch(/td:nth-child\(10\)\{grid-area:2 \/ 2 \/ 3 \/ 3 !important;/);
});

test('the Details button stays a real toggle, and a tap on the card opens it', () => {
  // The button is still the control with aria-expanded; it is no longer a full-width slab.
  expect(historyPhone).toMatch(/#hist-body \.phone-record-toggle\{[^}]*min-height:44px;/);
  expect(historyPhone).not.toMatch(/phone-record-toggle\{[^}]*width:\s*100%/);
  // hist-body alone opts into the card-wide tap, inside phone-layout's records enhancer.
  expect(layout).toMatch(/'hist-body': \{ lead: 1, summary: \[0, 4, 8, 9\], card: true \}/);
  expect(layout).toMatch(/if \(config\.card\) \{\s*row\.addEventListener\('click'/);
  expect(layout).toMatch(/if \(event\.target\.closest\('button, a, input, select, textarea, label'\)\) return;/);
  expect(layout).toMatch(/matchMedia\?\.\('\(max-width: 768px\)'\)/);
});

test('the details open as labelled lines, not the old hidden columns', () => {
  expect(historyPhone).toMatch(/td\.phone-record-detail::before\{display:inline;/);
  expect(historyPhone).not.toMatch(/nth-child\(8\)\{display:none;\}/);
  expect(historyPhone).not.toMatch(/nth-child\(4\),?\s*#tab-history[^{]*\{display:none;\}/);
});

test('on a phone the three summary tiles are one compact row', () => {
  expect(historyPhone).toMatch(/#tab-history \.hist-kpi-container\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);/);
  expect(historyPhone).toMatch(/#tab-history \.hist-kpi-icon\{display:none;\}/);
  expect(historyPhone).toMatch(/#tab-history \.hist-kpi-val\{font-size:var\(--text-lg\);\}/);
});

test('the phone history block uses tokens only, with no raw colour values', () => {
  expect(historyPhone.length).toBeGreaterThan(500);
  expect(historyPhone).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  expect(historyPhone).not.toMatch(/rgba?\(/);
});

test('the three figure tiles share rows so the figures line up across them', () => {
  const riso = read('../src/styles/phone-riso.css');
  const card = riso.match(/\.pub-shell #tab-history \.hist-kpi-card\s*\{([\s\S]*?)\}/);
  const content = riso.match(/\.pub-shell #tab-history \.hist-kpi-content\s*\{([\s\S]*?)\}/);
  expect(card[1]).toMatch(/grid-row:\s*span 3/);
  expect(card[1]).toMatch(/grid-template-rows:\s*subgrid/);
  expect(content[1]).toMatch(/display:\s*contents/);
});
