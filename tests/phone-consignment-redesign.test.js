import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { appSource } from './helpers/extract-decl.js';

// The phone Consignment screen: Stores, Invoices and Ledger take turns under a
// tab row, store cards fold their secondary actions, invoices get a full-width
// action row, and the ledger's filters fold behind a counted button. Desktop
// keeps all three sections on the page. String checks pin the markup and the
// CSS; the jsdom check drives the section handler through the real app.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');
const html = read('index.html');
const style = read('src/style.css');
const phone = read('src/styles/phone.css');
const system = read('src/styles/system.css');
// main.js plus the feature and lib modules (invoices live in features/invoices.js).
const main = appSource;
const layout = read('src/lib/phone-layout.js');

/** The per-book Consignment tab, sliced out of index.html by its panel id. */
function consignmentPanel() {
  const start = html.indexOf('<div class="tab-panel" id="tab-consignment"');
  const end = html.indexOf('<!-- HISTORY -->', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

/** The phone block for this screen: everything from its comment to the end of phone.css. */
function phoneConsignment() {
  const start = phone.indexOf('/* ─── CONSIGNMENT ON A PHONE');
  expect(start).toBeGreaterThan(-1);
  return phone.slice(start);
}

/** The desktop-side rules in style.css, next to the other consignment rules. */
function desktopConsignment() {
  const start = style.indexOf('/* ─── CONSIGNMENT: PHONE-ONLY CONTROLS');
  const end = style.indexOf('/* ─── DASHBOARD — SALES BY CHANNEL', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return style.slice(start, end);
}

describe('the section tab row', () => {
  it('is a tablist with three tabs, one per section', () => {
    const panel = consignmentPanel();
    expect(panel).toMatch(/<div class="con-section-tabs" id="con-section-tabs" role="tablist"/);
    expect(panel.match(/role="tab"/g) || []).toHaveLength(3);
    for (const name of ['stores', 'invoices', 'ledger']) {
      expect(panel).toMatch(new RegExp(`role="tab"[^>]*data-con-tab="${name}"`));
    }
  });

  it('wires each tab to the section it shows, and marks exactly one selected', () => {
    const panel = consignmentPanel();
    expect(panel).toMatch(/data-con-tab="stores"[^>]*aria-controls="con-sec-stores"/);
    expect(panel).toMatch(/data-con-tab="invoices"[^>]*aria-controls="invoices-section"/);
    expect(panel).toMatch(/data-con-tab="ledger"[^>]*aria-controls="con-sec-ledger"/);
    expect(panel.match(/aria-selected="true"/g) || []).toHaveLength(1);
    expect(panel).toMatch(/id="con-tab-stores"[^>]*aria-selected="true"/);
  });

  it('starts the Invoices tab hidden, as its section is until renderInvoices shows it', () => {
    expect(consignmentPanel()).toMatch(/id="con-tab-invoices"[^>]*\shidden>/);
  });

  it('gives each section its id and data-con-section value', () => {
    const panel = consignmentPanel();
    expect(panel).toMatch(/<div class="overview-section" id="con-sec-stores" data-con-section="stores">/);
    expect(panel).toMatch(/<div class="overview-section" data-con-section="invoices" id="invoices-section"/);
    expect(panel).toMatch(/<div class="overview-section" id="con-sec-ledger" data-con-section="ledger">/);
  });

  it('defaults the panel to the Stores section', () => {
    expect(consignmentPanel()).toMatch(/id="tab-consignment" data-con-active="stores"/);
  });

  it('shows the tab row only on a phone, and hides the non-active sections there', () => {
    expect(desktopConsignment()).toMatch(/\.con-section-tabs \{ display: none; \}/);
    const rules = phoneConsignment();
    expect(rules).toMatch(/\*\/\s*@media \(max-width: 768px\) \{/);
    expect(rules).toMatch(/#tab-consignment \.con-section-tabs \{\s*display: flex;/);
    expect(rules).toMatch(/#tab-consignment\[data-con-active="stores"\] :is\(\[data-con-section="invoices"\], \[data-con-section="ledger"\]\)/);
    expect(rules).toMatch(/#tab-consignment\[data-con-active="invoices"\] :is\(\[data-con-section="stores"\], \[data-con-section="ledger"\]\)/);
    expect(rules).toMatch(/#tab-consignment\[data-con-active="ledger"\] :is\(\[data-con-section="stores"\], \[data-con-section="invoices"\]\)[^}]*display: none !important;/);
  });

  it('keeps the tab row out of the desktop layout', () => {
    // The phone block is the only place the row is shown.
    expect(phone.indexOf('#tab-consignment .con-section-tabs {')).toBeGreaterThan(phone.indexOf('CONSIGNMENT ON A PHONE'));
  });

  it('is wired in main.js to a handler that remembers the choice', () => {
    expect(main).toMatch(/function setConSection\(name\) \{/);
    expect(main).toMatch(/sessionStorage\.setItem\(CON_SECTION_KEY, conSectionChoice\)/);
    expect(main).toMatch(/Object\.assign\(window, \{ setConSection, toggleConLedgerFilter \}\);/);
    expect(main).toContain("$('con-section-tabs')?.addEventListener('keydown', onConSectionTabKey);");
  });
});

describe('store cards on a phone', () => {
  it('folds the secondary actions behind "More actions" through the shared helper', () => {
    expect(layout).toMatch(/export function foldFooterActions\(group\) \{/);
    expect(main).toMatch(/import \{ foldFooterActions, initPhoneLayouts \} from '\.\/lib\/phone-layout\.js';/);
    expect(main).toContain("el.querySelectorAll('.store-actions').forEach(foldFooterActions);");
    // The shared fold is display:contents on a wide screen, so desktop is unchanged.
    // The toggle is a .btn, which outranks the shared rule, so the wide layout
    // hides it again with a rule of its own (a regression the shot caught).
    expect(desktopConsignment()).toMatch(/\.store-actions \.phone-more-toggle \{ display: none; \}/);
    expect(phone).toMatch(/\.phone-more-panel \{ display: contents; \}/);
    expect(phone).toMatch(/\.phone-more-toggle \{ display: none; \}/);
  });

  it('keeps the main actions first and Remove last in the markup', () => {
    const render = main.slice(main.indexOf('function renderStores() {'), main.indexOf('async function removeStore('));
    const order = ['openSend(', 'openSale(', 'openRet(', 'showStoreLedger(', 'openEditStore(', 'removeStore('];
    const at = order.map((call) => render.indexOf(call));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('lets Remove read as destructive but quiet inside the fold, not as a full-width slab', () => {
    const rules = phoneConsignment();
    const remove = rules.match(/#tab-consignment \.store-actions \.phone-more-panel > \.danger-btn \{([^}]*)\}/);
    expect(remove).not.toBeNull();
    expect(remove[1]).toMatch(/background: transparent;/);
    expect(remove[1]).toMatch(/border-color: var\(--status-critical\);/);
    expect(remove[1]).toMatch(/color: var\(--status-critical\);/);
    expect(remove[1]).not.toMatch(/width:\s*100%/);
  });

  it('puts the two main actions side by side on a phone, each at a full touch target', () => {
    const rules = phoneConsignment();
    expect(rules).toMatch(/#tab-consignment \.store-actions \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(style).toMatch(/\.store-actions \.btn\{min-height:var\(--target-min\)/);
    expect(rules).toMatch(/\.store-actions\[data-phone-folded\] \.phone-more-toggle \{ display: inline-flex;[^}]*min-height: var\(--target-min\)/);
  });
});

describe('the ledger filter on a phone', () => {
  it('keeps the status line outside the fold, so its live region still announces', () => {
    expect(html).toMatch(/id="con-ledger-controls"><\/div>\s*<p class="ledger-filter-status" id="con-ledger-status" aria-live="polite">/);
    const rules = phoneConsignment();
    expect(rules).toMatch(/#con-ledger-filter:not\(\.is-open\) #con-ledger-controls \{ display: none; \}/);
    expect(rules).not.toMatch(/con-ledger-status[^}]*display:\s*none/);
    expect(rules).not.toMatch(/ledger-filter-status[^}]*display:\s*none/);
  });

  it('has a counted toggle that is shown only on a phone', () => {
    expect(html).toMatch(/id="con-ledger-filter-toggle" aria-expanded="false" aria-controls="con-ledger-controls"/);
    expect(desktopConsignment()).toMatch(/\.con-ledger-filter-toggle \{ display: none; \}/);
    expect(phoneConsignment()).toMatch(/#con-ledger-filter \.con-ledger-filter-toggle \{\s*display: flex;/);
    expect(main).toMatch(/`Filter · \$\{activeFilters\} active`/);
  });

  it('makes every chip and the clear button at least 44px tall on a phone', () => {
    expect(system).toMatch(/--target-min: 44px;/);
    expect(phoneConsignment()).toMatch(/#con-ledger-filter \.ledger-toggle-btn,\s*#con-ledger-filter \.ledger-filter-chips \.btn \{ min-height: var\(--target-min\); \}/);
  });

  it('shows the ledger totals above the list on a phone, without recomputing them', () => {
    expect(phoneConsignment()).toMatch(/#tab-consignment #ledger-foot \{ order: -1;/);
    expect(html).toMatch(/<tfoot id="ledger-foot"><\/tfoot>/);
    expect(main).toContain('foot.innerHTML = consignmentLedgerFootHtml(consignmentLedgerTotals(matched, ledgerBookCode)');
  });

  it('opens the filter when a store card jumps to its rows', () => {
    const start = main.indexOf('function showStoreLedger(');
    const jump = main.slice(start, start + 500);
    expect(jump).toMatch(/setConSection\('ledger'\);/);
    expect(jump).toMatch(/setConLedgerFilterOpen\(true\);/);
  });
});

describe('invoices and section heads on a phone', () => {
  it('lays the invoice actions out as a full-width row, with Remind/Chase leading', () => {
    const rules = phoneConsignment();
    expect(rules).toMatch(/#invoices-list \.invoice-card \.inv-c-btns \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(rules).toMatch(/#invoices-list \.invoice-card \.inv-c-btns > \.btn:first-child:nth-last-child\(3\) \{ grid-column: 1 \/ -1; \}/);
  });

  it('writes the invoice summary as one span per figure, separators hidden on a phone', () => {
    expect(main).toContain("part.className = 'inv-sum-part';");
    expect(main).toContain("sep.className = 'inv-sum-sep';");
    expect(phoneConsignment()).toMatch(/#tab-consignment \.inv-sum-sep \{ display: none; \}/);
    expect(consignmentPanel()).toMatch(/<div id="inv-summary" class="sec-head-note"><\/div>/);
  });

  it('keeps the section-head actions in one compact row on a phone', () => {
    expect(phoneConsignment()).toMatch(/#tab-consignment \.sec-head-badges \{ display: flex; flex-wrap: wrap;/);
  });

  it('writes the per-tab counts from what each screen has just rendered', () => {
    expect(main).toMatch(/setConTabCount\('stores', s\.stores\.length\);/);
    expect(main).toMatch(/setConTabCount\('invoices', invs\.length\);/);
    expect(main).toMatch(/setConTabCount\('ledger', s\.ledger\.length\);/);
  });
});

describe('new styling uses tokens only', () => {
  it('has no raw colour in the desktop or phone consignment rules', () => {
    const raw = /#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\brgba?\(|\bhsla?\(/i;
    expect(desktopConsignment()).not.toMatch(raw);
    expect(phoneConsignment()).not.toMatch(raw);
  });

  it('keeps the new tab row square, with a 2px ink outline', () => {
    const rules = phoneConsignment();
    expect(rules).toMatch(/#tab-consignment \.con-section-tabs \{[^}]*border: var\(--stroke\) solid var\(--rule-ink\);/);
    expect(rules).toMatch(/#tab-consignment \.con-section-tab \{[^}]*border-radius: var\(--r2\);/);
  });
});

describe('the section handler, driven through the real app', () => {
  let app;
  beforeAll(async () => {
    const book = makeBook({ id: 'consign-phone', currency: 'CA$' });
    app = await loadApp({ books: [book] });
    app.window.switchBook('consign-phone');
  }, 30000);

  it('moves the panel to the chosen section, marks its tab selected and remembers it', () => {
    const panel = document.getElementById('tab-consignment');
    app.window.setConSection('ledger');
    expect(panel.dataset.conActive).toBe('ledger');
    expect(document.getElementById('con-tab-ledger').getAttribute('aria-selected')).toBe('true');
    expect(document.getElementById('con-tab-stores').getAttribute('aria-selected')).toBe('false');
    expect(app.window.sessionStorage.getItem('lm-con-section')).toBe('ledger');
  });

  it('falls back to Stores for a section name it does not know', () => {
    app.window.setConSection('nonsense');
    expect(document.getElementById('tab-consignment').dataset.conActive).toBe('stores');
  });
});
