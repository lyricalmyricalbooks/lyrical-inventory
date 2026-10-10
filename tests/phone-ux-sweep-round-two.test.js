import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Second phone sweep: found by driving the real app at 360/390/412px with the
// test profile's sample data and checking every page and pop-up for words
// split mid-letter, content past the screen edge, controls under a fingertip,
// text under 11px and controls only shown on mouse hover.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const phone = read('src/styles/phone.css');
const style = read('src/style.css');
const html = read('index.html');
const layout = read('src/lib/phone-layout.js');

test('the two smallest type steps start at 11px on a phone', () => {
  expect(phone).toMatch(/@media \(max-width: 768px\) \{\s*:root \{ --text-3xs: 11px; --text-2xs: 11px; \}/);
});

test('the pinned first heading of a wide table keeps the dark header ink', () => {
  expect(style).toMatch(/\.tab-panel:not\(#tab-history\) \.tbl thead th:first-child\{background:var\(--surface-inverse\);\}/);
});

test('the book dashboard header strip wraps instead of widening the page', () => {
  // The older rule names .dash-context; the strip's class is .dashboard-context.
  expect(html).toMatch(/class="book-context dashboard-context" id="book-context-dash"/);
  expect(phone).toMatch(/#book-context-dash \{ flex-wrap: wrap;/);
  expect(phone).toMatch(/#book-context-dash > div \{ min-width: 0; flex-wrap: wrap; \}/);
});

test('artist expenses on the dashboard become phone cards instead of clipping', () => {
  expect(html).toMatch(/<tbody id="d-exp-body"/);
  expect(layout).toMatch(/'d-exp-body': \{ lead: 1, summary: \[0, 4\] \}/);
});

test('the to-do dismiss cross is visible and full-size on touch screens', () => {
  expect(phone).toMatch(/\.todo-dismiss \{ opacity: 1; width: 44px; height: 44px; \}/);
});

test('small segmented tabs, filter pills and swatches reach a fingertip', () => {
  expect(phone).toMatch(/\.modal-tabs \.modal-tab-btn, \.tcc-filter-pill \{ min-height: 44px; \}/);
  expect(phone).toMatch(/\.accent-swatch-btn \{ width: 40px; height: 40px; \}/);
});

test('inventory valuation footer is one group so a phone folds the extras', () => {
  const footer = html.match(/<div class="iv-footer-actions"[^>]*>([\s\S]*?)<\/div>/);
  expect(footer).not.toBeNull();
  const order = [...footer[1].matchAll(/onclick="([a-zA-Z]+)/g)].map(m => m[1]);
  expect(order).toEqual(['attemptCloseModal', 'downloadInventoryValuationCSV', 'printInventoryValuationReport', 'openInventoryWriteOffModal']);
  expect(style).toMatch(/\.iv-footer-actions \.iv-adjust-btn\{order:-1;margin-right:auto;\}/);
});
