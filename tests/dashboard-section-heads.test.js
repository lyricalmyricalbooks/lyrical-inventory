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

test('profit sharing, sales by channel, consignment overview, inventory and break-even share the section-head pattern', () => {
  const panel = dashboardPanel();

  // This is the screen the publisher opens for every single book. It used to
  // head its report sections with `.sect` — the same 9px micro-label the
  // "All books" landing screen and the Consignment tab were both pulled off
  // of for exactly this reason. Profit Sharing Breakdown was the one section
  // that still fell back to it after the other four were fixed (it sits
  // above them, right below the KPI grid, so it read as already handled).
  // None of the five may fall back to it.
  expect(panel).not.toMatch(/class="sect"[^>]*>Profit Sharing Breakdown</);
  expect(panel).not.toMatch(/class="sect">Sales by channel</);
  expect(panel).not.toMatch(/class="sect">Consignment overview</);
  expect(panel).not.toMatch(/class="sect">Inventory</);
  expect(panel).not.toMatch(/class="sect">Break-even tracker</);

  const serifHeads = panel.match(/class="section-hed sec-head-title"/g) || [];
  expect(serifHeads).toHaveLength(5);
  expect(panel).toMatch(/class="section-hed sec-head-title">Profit Sharing Breakdown</);
  expect(panel).toMatch(/class="section-hed sec-head-title">Sales by channel</);
  expect(panel).toMatch(/class="section-hed sec-head-title">Consignment overview</);
  expect(panel).toMatch(/class="section-hed sec-head-title">Inventory</);
  expect(panel).toMatch(/class="section-hed sec-head-title">Break-even tracker</);

  // Each head carries a kicker with its dot, and a line of subcopy.
  expect(panel.match(/class="sec-kicker"/g) || []).toHaveLength(5);
  expect(panel.match(/class="sec-kicker-dot"/g) || []).toHaveLength(5);
  expect(panel.match(/class="section-subcopy"/g) || []).toHaveLength(5);
});

test('gold stays spent once on this screen — all five heads are muted', () => {
  const panel = dashboardPanel();
  // The KPI grid above already spends this screen's one gold accent on
  // "Stock on hand" (`.kpi.is-lead`). A second gold kicker here would compete
  // with it, so every head takes the neutral slate.
  const heads = panel.match(/<div class="sec-head(?: [\w-]+)? is-muted">/g) || [];
  expect(heads).toHaveLength(5);
  expect(heads.every(h => h.includes('is-muted'))).toBe(true);
});

test('profit sharing card sits directly in a .card, so its head carries its own wrap modifier', () => {
  const panel = dashboardPanel();
  // Unlike the other four heads, this one isn't nested in an `.overview-section`
  // (it's inside `#d-profit-sharing-block`, a `.card`), so the shared
  // `@container overview-sec` stack rule never fires for it — `.ps-block-head`
  // carries its own `flex-wrap`, matching `.cat-settings-head`'s off-container case.
  expect(panel).toMatch(/id="d-profit-sharing-block" class="card"[^>]*>\s*<div class="sec-head ps-block-head is-muted">/);
});

test('each overview-section still shares one rhythm', () => {
  const panel = dashboardPanel();
  expect(panel.match(/class="overview-section"/g) || []).toHaveLength(4);
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
