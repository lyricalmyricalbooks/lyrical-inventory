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
    expect(block).toMatch(/<summary>Payment settings<span class="recon-fold-sub"> · Stripe key, short codes, alerts<\/span><\/summary>/);
  });

  test('Accepted Payment Methods is its own fold and keeps its container id', () => {
    const open = panel.indexOf('<details class="recon-fold" id="pm-settings">');
    expect(open).toBeGreaterThan(-1);
    const block = panel.slice(open, panel.indexOf('</details>', open));
    expect(block).toMatch(/<summary>Accepted payment methods<\/summary>/);
    expect(block).toContain('id="payment-methods-config-container"');
    expect(block).toContain('id="pm-global-list"');
  });

  test('renderReconcile sets each fold once: Stripe settings open only with no saved key', () => {
    expect(main).toContain('_reconInitFolds(!!_reconSavedKey());');
    const init = fnBody('function _reconInitFolds(', 'function reconOnFilter(');
    // Wide screens: both open as cards. Phones: Stripe settings open only with no saved key.
    expect(init).toMatch(/\['recon-settings', wide \|\| !hasKey\], \['pm-settings', wide\]/);
    expect(init).toMatch(/el\.open = open;/);
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
    expect(cards).toMatch(/class="recon-fields recon-pick"/);
    expect(cards).toMatch(/recon-f-book/);
    expect(cards).toMatch(/class="recon-act"/);
  });

  test('the Record sale hint is a visible line keyed to the book choice', () => {
    expect(main).toMatch(/Choose a book to record this sale\./);
    expect(main).toMatch(/id="recon-hint-\$\{idSafe\}"/);
    expect(main).toMatch(/const hint = document\.getElementById\(`\$\{prefix\}hint-\$\{id\}`\);/);
  });

  test('#recon-summary is one card of four figures: Needs you, Ready, Done this week, Recorded', () => {
    expect(main).toMatch(/summaryEl\.innerHTML = `<div class="recon-stats">/);
    for (const label of ["'Needs you', needYou.length", "'Ready', ready.length", "'Done this week', wk.done", "'Recorded', wk.recorded"]) {
      expect(main).toContain(label);
    }
  });

  test('the order number, amount, currency and rate fold away under Details on each row', () => {
    const card = fnBody('function _reconNeedCard(', 'export function renderReconcile() {');
    const details = card.slice(card.indexOf('<details class="recon-more">'));
    for (const id of ['recon-num-', 'recon-amount-', 'recon-currency-', 'recon-rate-']) expect(details).toContain(id);
    expect(card.slice(0, card.indexOf('<details class="recon-more">'))).toContain('recon-book-');
  });

  test('the search box shows only for a list long enough to need it, its layout left to the stylesheet', () => {
    expect(main).toContain("toolbarEl.style.display = payments.length > 6 ? '' : 'none';");
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

describe('Payments search is inked on a phone', () => {
  const css = readFileSync('src/styles/phone.css', 'utf8');
  const rule = (sel) => [...css.matchAll(new RegExp('(?:^|\\n)\\s*' + sel.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'))].map((m) => m[1]).join(' ');
  test('the search box uses the 2px ink outline', () => {
    expect(rule('#tab-reconcile .recon-search')).toMatch(/border:\s*var\(--stroke\) solid var\(--border-strong\)/);
  });
  test('tags are square, not lozenges', () => {
    expect(rule('#tab-reconcile .recon-pill')).toMatch(/border-radius:\s*var\(--r2\)/);
  });
});

describe('one inbox instead of a toolbar of filters', () => {
  test('search is the only control left above the list', () => {
    const toolbar = panel.slice(panel.indexOf('id="recon-toolbar"'), panel.indexOf('</div>', panel.indexOf('id="recon-toolbar"')));
    expect(toolbar).toContain('id="recon-search"');
    for (const gone of ['recon-type', 'recon-sort', 'recon-group', 'recon-cur-chips', 'reconDismissAllShown']) {
      expect(panel).not.toContain(gone);
    }
  });

  test('the settings come after the list', () => {
    expect(panel.indexOf('id="recon-settings"')).toBeGreaterThan(panel.indexOf('id="recon-matched"'));
  });

  test('the list is drawn as a Needs you section and a Ready section with one Confirm all button', () => {
    const render = fnBody('export function renderReconcile() {', 'function _reconSection(');
    expect(render).toMatch(/_reconSection\('need', 'Needs you'/);
    expect(render).toMatch(/_reconSection\('ready', 'Ready'/);
    expect(render).toMatch(/data-action="recon\.confirmReady">Confirm all \$\{ready\.length\}/);
    expect(render).not.toMatch(/_reconFilter\.group|_reconBulk/);
  });

  test('Done is a fold with Undo on named actions, not inline handlers', () => {
    const render = fnBody('export function renderReconcile() {', 'function _reconSection(');
    expect(render).toMatch(/<details class="recon-fold recon-done"/);
    expect(render).toMatch(/data-action="recon\.undo"/);
    expect(render).not.toContain('onclick="(function(el)');
  });
});
