import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Payments screen (#tab-reconcile) on a phone: the worklist first, settings
// folded away, record cards instead of inline-styled rows. String assertions
// on the shipped source, in the style of phone-record-cards-riso.test.js.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const main = read('src/main.js');
const style = read('src/style.css');
const phone = read('src/styles/phone.css');
const layout = read('src/lib/phone-layout.js');

// The Payments panel, from its opening comment to the Customers panel.
const panel = html.slice(html.indexOf('id="tab-reconcile"'), html.indexOf('id="tab-customers"'));

// Text of one function body in main.js, from its declaration to the next top-level function.
const fnBody = (sig, next) => {
  const start = main.indexOf(sig);
  expect(start).toBeGreaterThan(-1);
  return main.slice(start, main.indexOf(next, start + sig.length));
};

describe('payment settings fold away', () => {
  test('key row, auto-record toggle, short codes and notify toggle sit inside #recon-settings', () => {
    const open = panel.indexOf('<details class="recon-fold" id="recon-settings">');
    expect(open).toBeGreaterThan(-1);
    const close = panel.indexOf('</details>', open);
    const block = panel.slice(open, close);
    for (const id of ['recon-keyrow', 'stripe-sale-auto-wrap', 'stripe-sale-auto-cb', 'sale-codes-box', 'stripe-sale-codes', 'stripe-paid-notify-wrap', 'stripe-paid-notify-cb']) {
      expect(block).toContain(id);
    }
    expect(block).toMatch(/<summary>Payment settings · Stripe key, short codes, alerts<\/summary>/);
  });

  test('Accepted Payment Methods is its own fold and keeps its container id', () => {
    const open = panel.indexOf('<details class="recon-fold" id="pm-settings">');
    expect(open).toBeGreaterThan(-1);
    const block = panel.slice(open, panel.indexOf('</details>', open));
    expect(block).toMatch(/<summary>Accepted payment methods<\/summary>/);
    expect(block).toContain('id="payment-methods-config-container"');
    expect(block).toContain('id="pm-global-list"');
  });

  test('renderReconcile opens each fold once: wide screen, or no saved key', () => {
    expect(main).toContain('_reconInitFolds(!!_reconSavedKey());');
    const init = fnBody('function _reconInitFolds(', 'function reconOnFilter(');
    expect(init).toMatch(/matchMedia\?\.\('\(min-width: 769px\)'\)/);
    expect(init).toMatch(/el\.open = wide \|\| !hasKey;/);
    expect(init).toMatch(/dataset\.foldInit/);
  });
});

describe('reconciled payments render as record cards', () => {
  test('the reconciled tbody has the id the record config targets', () => {
    expect(main).toContain('<tbody id="recon-matched-body">');
  });

  test('RECORDS maps recon-matched-body: Customer leads, Date/Amount/Status/Undo summarised', () => {
    expect(layout).toMatch(/'recon-matched-body': \{ lead: 2, summary: \[0, 1, 3, 4\] \}/);
  });

  test('the record observer watches the whole body, so a table rendered later is enhanced', () => {
    expect(layout).toMatch(/observer\.observe\(root, \{ childList: true, subtree: true \}\);/);
    expect(main).toMatch(/initPhoneLayouts\(document\.body\);/);
  });
});

describe('card and summary markup', () => {
  test('no inline width, height or flex on the need and group card functions', () => {
    const cards = fnBody('function _reconAmountBadge(', 'export function renderReconcile() {');
    expect(cards).not.toMatch(/width:280px|height:38px/);
    expect(cards).not.toMatch(/style="/);
    expect(cards).toMatch(/class="recon-fields"/);
    expect(cards).toMatch(/recon-f-book/);
    expect(cards).toMatch(/recon-actions/);
  });

  test('the Record sale hint is a visible line keyed to the book choice', () => {
    expect(main).toMatch(/Choose a book to record this sale\./);
    expect(main).toMatch(/id="recon-hint-\$\{idSafe\}"/);
    expect(main).toMatch(/const hint = document\.getElementById\(`\$\{prefix\}hint-\$\{id\}`\);/);
  });

  test('#recon-summary renders a KPI strip with the lead figure marked', () => {
    expect(main).toMatch(/summaryEl\.innerHTML = `<div class="kpi-grid recon-kpis">/);
    expect(main).toMatch(/<div class="kpi is-lead"><div class="kpi-label">Need review<\/div>/);
    expect(main).toMatch(/<div class="kpi-label">Reconciled<\/div>/);
    expect(main).toMatch(/<div class="kpi-label">Total<\/div>/);
  });

  test('the explanatory paid-amount note is rendered once above the worklist, not per card', () => {
    const cards = fnBody('function _reconNeedCard(', 'function _reconGroupCard(');
    expect(cards).not.toMatch(/Stripe’s paid amount is preserved/);
    expect(main).toMatch(/needsEl\.innerHTML = _RECON_PAID_NOTE_HTML \+ /);
  });

  test('the toolbar display is left to the stylesheet (not forced to flex inline)', () => {
    expect(main).toContain("toolbarEl.style.display = needs.length ? '' : 'none';");
  });
});

describe('phone layout rules', () => {
  // The phone block for Payments, from its comment to the end of the file.
  const phoneBlock = phone.slice(phone.indexOf('/* Payments (#tab-reconcile)'));

  test('the phone block sets the toolbar static and the worklist order', () => {
    expect(phoneBlock).toMatch(/@media \(max-width: 768px\) \{/);
    expect(phoneBlock).toMatch(/#tab-reconcile \.recon-layout \{ display: flex; flex-direction: column;/);
    expect(phoneBlock).toMatch(/#tab-reconcile #recon-toolbar \{ order: 4; \}/);
    expect(phoneBlock).toMatch(/#tab-reconcile #recon-needs \{ order: 5; \}/);
    expect(phoneBlock).toMatch(/#tab-reconcile #recon-matched \{ order: 6; \}/);
    expect(phoneBlock).toMatch(/#tab-reconcile #recon-settings \{ order: 7; \}/);
    expect(phoneBlock).toMatch(/#tab-reconcile \.recon-toolbar \{ position: static;/);
  });

  test('the panel wraps its content in .recon-layout', () => {
    expect(panel).toMatch(/<div class="recon-layout">/);
  });

  test('the phone Record sale and sync buttons reach a finger-sized target', () => {
    expect(phoneBlock).toMatch(/#tab-reconcile \.recon-actions \.btn \{ width: 100%; height: auto; min-height: var\(--target-min\);/);
    expect(phoneBlock).toMatch(/#tab-reconcile #recon-sync-btn \{ width: 100%; min-height: var\(--target-min\);/);
  });
});

describe('new CSS uses tokens only', () => {
  const styleBlock = style.slice(style.indexOf('/* ── Payments screen (#tab-reconcile)'), style.indexOf('/* ── Accepted Payment Methods Config'));
  const phoneBlock = phone.slice(phone.indexOf('/* Payments (#tab-reconcile)'));

  test('desktop payments rules have no raw hex or rgb colours', () => {
    expect(styleBlock.length).toBeGreaterThan(500);
    expect(styleBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(styleBlock).not.toMatch(/\brgba?\(/);
  });

  test('phone payments rules have no raw hex or rgb colours', () => {
    expect(phoneBlock.length).toBeGreaterThan(500);
    expect(phoneBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(phoneBlock).not.toMatch(/\brgba?\(/);
  });

  test('the settings folds are Riso summary rows: ink outline, square, at least 44px', () => {
    expect(styleBlock).toMatch(/\.recon-fold > summary\{[^}]*min-height:var\(--target-min\)/);
    expect(styleBlock).toMatch(/border:var\(--stroke\) solid var\(--rule-ink\)/);
    expect(styleBlock).toMatch(/border-radius:var\(--r2\)/);
  });
});

describe('Payments toolbar is inked on a phone', () => {
  const css = readFileSync('src/styles/phone.css', 'utf8');
  const rule = (sel) => [...css.matchAll(new RegExp('(?:^|\\n)\\s*' + sel.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'))].map((m) => m[1]).join(' ');
  test('frame, search and drop-downs use the 2px ink outline', () => {
    expect(rule('#tab-reconcile .recon-toolbar')).toMatch(/border:\s*var\(--stroke\) solid var\(--border-strong\)/);
    expect(rule('#tab-reconcile .recon-search, #tab-reconcile .recon-mini')).toMatch(/border:\s*var\(--stroke\) solid var\(--border-strong\)/);
  });
  test('filter chips and tags are square, not lozenges', () => {
    expect(rule('#tab-reconcile .recon-chip')).toMatch(/border-radius:\s*var\(--r2\)/);
    expect(rule('#tab-reconcile .recon-pill')).toMatch(/border-radius:\s*var\(--r2\)/);
  });
});
