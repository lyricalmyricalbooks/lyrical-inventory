// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initPhoneLayouts } from '../src/lib/phone-layout.js';

// Phone sweep round 4 (A): All books → consignment, History return tags, the
// Intelligence quick asks, the To-do group for receipts, and card hairlines.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const main = read('src/main.js');
const phone = read('src/styles/phone.css');
const signals = read('src/lib/attention-signals.js');

const SECTION = '/* ─── SWEEP FIXES A (round 4) ─── */';

describe('All books consignment shows returns so Sent adds up', () => {
  it('has a Returned column between Sold and Outstanding in the header', () => {
    expect(html).toMatch(/<th class="r">Sold<\/th><th class="r">Returned<\/th><th class="r">Outstanding<\/th>/);
  });

  it('sums each store\'s returned copies into the group totals, the way sent and sold are summed', () => {
    expect(main).toMatch(/const totals = \{ sent: 0, sold: 0, returned: 0, outstanding: 0, active: 0 \};/);
    expect(main).toMatch(/totals\.returned \+= r\.returned;/);
    expect(main).toMatch(/const totals = \{ sent: 0, sold: 0, returned: 0, outstanding: 0, active: 0 \};\n\s+for \(const r of rows\)/);
    expect(main).toMatch(/returned: st\.returned \|\| 0, outstanding: st\.outstanding \|\| 0/);
  });

  it('tightens the desktop ledger padding at the narrow panel width so the eighth column still fits', () => {
    const style = read('src/style.css');
    expect(style).toMatch(/@container con-summary \(max-width: 720px\)\{\n\s+\.all-consignment-table \.tbl th,\n\s+\.all-consignment-table \.tbl td\{padding-left:6px;padding-right:6px;\}/);
  });

  it('renders a Returned cell on the group strip, the store rows and every empty state spans all eight columns', () => {
    expect(main).toContain('<td class="r tnum">${b.totals.returned}</td>');
    expect(main).toContain('<td class="r tnum">${r.returned ?? 0}</td>');
    expect(main).not.toMatch(/<tr><td colspan="7"><div class="empty-state con-empty-state"/);
  });

  it('keeps the phone card summary on Returned and Outstanding, with the RECORDS indexes matching the header', () => {
    const layout = read('src/lib/phone-layout.js');
    expect(layout).toContain("'all-con-body': { lead: 0, summary: [1, 4, 5, 7] },");
  });
});

describe('phone card labels for the consignment group strip', () => {
  let stop;
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => stop?.());

  it('labels every figure on a group strip and a store card, including Returned', () => {
    document.body.innerHTML = '<div id="app"><table><thead><tr><th>Book</th><th>Store</th><th class="r">Sent</th><th class="r">Sold</th><th class="r">Returned</th><th class="r">Outstanding</th><th>Sell-through</th><th>Status</th></tr></thead>'
      + '<tbody id="all-con-body">'
      + '<tr class="con-group-row"><td colspan="2">Harbour Lights</td><td>49</td><td>27</td><td>4</td><td>18</td><td>55%</td><td>4 active</td></tr>'
      + '<tr class="con-nested-row"><td class="con-nested-spacer" aria-hidden="true"></td><td>Driftwood Books</td><td>10</td><td>6</td><td>2</td><td>2</td><td>60%</td><td>Active</td></tr>'
      + '</tbody></table></div>';
    stop = initPhoneLayouts(document.getElementById('app'));
    const [group] = document.querySelectorAll('#all-con-body tr');
    expect([...group.cells].map(c => c.dataset.phoneLabel)).toEqual(['Book', 'Sent', 'Sold', 'Returned', 'Outstanding', 'Sell-through', 'Status']);
    const store = document.querySelector('.con-nested-row');
    expect(store.classList.contains('phone-record')).toBe(true);
    const returned = [...store.cells].find(c => c.dataset.phoneLabel === 'Returned');
    const outstanding = [...store.cells].find(c => c.dataset.phoneLabel === 'Outstanding');
    expect(returned.classList.contains('phone-record-detail')).toBe(false);
    expect(outstanding.classList.contains('phone-record-detail')).toBe(false);
  });
});

describe('to-do: receipts sit under the money group, not missing book details', () => {
  it('moves the expenses-with-no-receipt signal into the money group', () => {
    expect(signals).toMatch(/id: `catalogue-receipts:\$\{book\.id\}`,\n\s+group: 'money',/);
  });
});

describe('phone CSS sweep fixes A', () => {
  const start = phone.indexOf(SECTION);
  const block = start === -1 ? '' : phone.slice(start);

  it('lives in one section at the end of phone.css, inside the phone breakpoint', () => {
    expect(start).toBeGreaterThan(-1);
    expect(phone.split(SECTION).length).toBe(2);
    expect(block.trim().startsWith(SECTION)).toBe(true);
    expect(block).toMatch(/^\/\* ─── SWEEP FIXES A \(round 4\) ─── \*\/\n@media \(max-width: 768px\) \{/);
  });

  it('uses no raw colour values', () => {
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).not.toMatch(/rgba?\(/);
  });

  it('lets the Intelligence quick asks take the full width with no 10rem cap and the app typeface', () => {
    expect(block).toMatch(/#tab-intel \.intel-rail \{[^}]*width: 100%;[^}]*max-height: none;/);
    expect(block).toMatch(/#tab-intel \.intel-rail-btn \{[^}]*width: 100%;[^}]*max-width: none;[^}]*font-family: inherit;/);
  });

  it('keeps the Manage button visible and on its own line, and the status tabs on one line', () => {
    expect(block).toMatch(/\.con-group-jump-btn \{ opacity: 1; visibility: visible;/);
    expect(block).toMatch(/\.con-filter-btn \{ flex-wrap: nowrap; white-space: nowrap;/);
  });

  it('drops the desktop tree line and the sticky-column rule on phone cards', () => {
    expect(block).toMatch(/\.con-tree-guide \{ display: none; \}/);
    expect(block).toMatch(/:is\(tr\.phone-record, tr\.phone-group-row\) > td:first-child \{ box-shadow: none !important; \}/);
  });

  it('lets return tags wrap inside their own box and leaves channel tags on one line', () => {
    expect(block).toMatch(/#tab-history #hist-body \.ch-badge\.ch-pos,\n\s+#tab-history #hist-body \.chip-status\.amber \{ white-space: normal; height: auto;/);
  });
});
