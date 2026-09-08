import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// Resolved via __dirname rather than `new URL(..., import.meta.url)`: under the
// jsdom test environment the global URL is jsdom's, and node:fs / fileURLToPath
// reject a foreign URL object with "must be of scheme file". Passing a string
// keeps node's own parser in play, and matches how the rest of tests/ does it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');

/** The per-book Dashboard tab, sliced out of index.html by its panel id. */
function dashboardPanel() {
  const start = html.indexOf('<div class="tab-panel" id="tab-dashboard"');
  const end = html.indexOf('<!-- WEBSITE -->', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

test('sales by channel, consignment overview and inventory share the section-head pattern', () => {
  const panel = dashboardPanel();

  // This is the screen the publisher opens for every single book. It used to
  // head its three main report sections with `.sect` — the same 9px
  // micro-label the "All books" landing screen and the Consignment tab were
  // both pulled off of for exactly this reason. None of the three may fall
  // back to it.
  expect(panel).not.toMatch(/class="sect">Sales by channel</);
  expect(panel).not.toMatch(/class="sect">Consignment overview</);
  expect(panel).not.toMatch(/class="sect">Inventory</);

  const serifHeads = panel.match(/class="section-hed sec-head-title"/g) || [];
  expect(serifHeads).toHaveLength(3);
  expect(panel).toMatch(/class="section-hed sec-head-title">Sales by channel</);
  expect(panel).toMatch(/class="section-hed sec-head-title">Consignment overview</);
  expect(panel).toMatch(/class="section-hed sec-head-title">Inventory</);

  // Each head carries a kicker with its dot, and a line of subcopy.
  expect(panel.match(/class="sec-kicker"/g) || []).toHaveLength(3);
  expect(panel.match(/class="sec-kicker-dot"/g) || []).toHaveLength(3);
  expect(panel.match(/class="section-subcopy"/g) || []).toHaveLength(3);
});

test('gold stays spent once on this screen — all three new heads are muted', () => {
  const panel = dashboardPanel();
  // The KPI grid above already spends this screen's one gold accent on
  // "Stock on hand" (`.kpi.is-lead`). A second gold kicker here would compete
  // with it, so every new head takes the neutral slate.
  const heads = panel.match(/<div class="sec-head(?: is-muted)?">/g) || [];
  expect(heads).toHaveLength(3);
  expect(heads.every(h => h.includes('is-muted'))).toBe(true);
});

test('each section is its own overview-section, so the gap comes from one shared rhythm', () => {
  const panel = dashboardPanel();
  expect(panel.match(/class="overview-section"/g) || []).toHaveLength(3);
});

test('the tables and stock block keep their real ids and structure under the new heads', () => {
  const panel = dashboardPanel();
  // Nothing that renderDashboard()/updateDashboard() writes into by id may
  // have moved or been renamed — only the heading furniture above it changed.
  expect(panel).toMatch(/<tbody id="ch-body"><\/tbody><tfoot id="ch-foot">/);
  expect(panel).toMatch(/<tbody id="dash-con-body"><\/tbody>/);
  expect(panel).toMatch(/class="stock-block">/);
  expect(panel).toMatch(/id="d-book-title">/);
  expect(panel).toMatch(/id="d-bar-track"/);
  expect(panel).toMatch(/id="d-recalc-onhand-wrap"/);
});
