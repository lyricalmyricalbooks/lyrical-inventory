// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const styles = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');

// Pull one top-level block of main.js out by its first and last markers and
// run it against the real markup, without booting Firebase.
function slice(startMarker, endMarker) {
  const start = mainJs.indexOf(startMarker);
  const end = mainJs.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return mainJs.slice(start, end);
}

beforeEach(() => {
  document.body.innerHTML = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '');
});

const $ = (id) => document.getElementById(id);

function posApi() {
  const src = slice('function posSyncReviewBar', 'window.posMobileView = function');
  return new Function('$', `${src}; return { posSyncReviewBar, posSyncPaymentSeg, pick: window.posPickPayment };`)($);
}

test('review bar mirrors the cart count and the total checkout already computed', () => {
  const pos = posApi();
  pos.posSyncReviewBar(0, '€0.00');
  expect($('pos-review-bar').hidden).toBe(true);
  pos.posSyncReviewBar(3, '€45.00');
  expect($('pos-review-bar').hidden).toBe(false);
  expect($('pos-review-count').textContent).toBe('3');
  expect($('pos-review-total').textContent).toBe('€45.00');
  expect($('pos-review-bar').getAttribute('aria-label')).toBe('Review sale: 3 books, €45.00');
});

test('review bar is fed by renderPOS from the painted total, not a second calculation', () => {
  expect(mainJs).toMatch(/posSyncReviewBar\(cartRows\.reduce\(\(count, row\) => count \+ row\.qty, 0\), totalEl\?\.textContent \|\| ''\);/);
});

test('payment buttons drive the existing select, which checkout still reads', () => {
  const pos = posApi();
  const select = $('pos-payment-method');
  const values = [...select.options].map((o) => o.value);
  const buttons = [...document.querySelectorAll('.pos-pay-opt')];
  // Every button maps to a real option, so a tap can never set an unknown method.
  expect(buttons.map((b) => b.dataset.pay).sort()).toEqual([...values].sort());
  pos.pick('Card');
  expect(select.value).toBe('Card');
  expect(document.querySelector('.pos-pay-opt[data-pay="Card"]').getAttribute('aria-checked')).toBe('true');
  expect(document.querySelector('.pos-pay-opt[data-pay="Cash"]').getAttribute('aria-checked')).toBe('false');
  // Changing the select directly (desktop) keeps the buttons in step.
  select.value = 'Bank Transfer';
  pos.posSyncPaymentSeg();
  expect(document.querySelector('.pos-pay-opt[data-pay="Bank Transfer"]').getAttribute('aria-checked')).toBe('true');
  expect(mainJs).toMatch(/const method = \$\('pos-payment-method'\)\.value;/);
});

test('dashboard sections marked to fold get a Show/Hide button and start folded', () => {
  const src = slice('function initPhoneFolds', 'initPhoneFolds();');
  new Function(`${src}; initPhoneFolds(); initPhoneFolds();`)();
  const sections = [...document.querySelectorAll('[data-phone-fold]')];
  expect(sections.length).toBeGreaterThanOrEqual(4);
  for (const s of sections) {
    const btns = s.querySelectorAll('.phone-fold-btn');
    expect(btns.length).toBe(1); // running twice never adds a second button
    expect(s.classList.contains('is-phone-folded')).toBe(true);
    expect(btns[0].getAttribute('aria-expanded')).toBe('false');
    expect(btns[0].getAttribute('aria-controls')).toBe(s.id);
  }
  const btn = sections[0].querySelector('.phone-fold-btn');
  btn.click();
  expect(sections[0].classList.contains('is-phone-folded')).toBe(false);
  expect(btn.getAttribute('aria-expanded')).toBe('true');
  expect(btn.textContent).toBe('Hide');
});

test('phone-only pieces stay hidden on a computer', () => {
  expect(styles).toMatch(/\.pos-pay-seg,\.pos-review-bar,\.phone-fold-btn\{display:none;\}/);
  // Folding only ever applies inside the phone media query.
  const phoneBlock = styles.slice(styles.indexOf('PHONE PAGE REDESIGNS'));
  expect(phoneBlock).toMatch(/\.is-phone-folded > :not\(\.sec-head\)\{display:none !important;\}/);
  expect(styles.slice(0, styles.indexOf('PHONE PAGE REDESIGNS'))).not.toMatch(/is-phone-folded/);
});

test('history cards keep order, channel, total, date and actions visible', () => {
  const header = [...document.querySelectorAll('#tab-history thead th')].map((th) => th.textContent);
  expect(header).toEqual(['Order #', 'Channel', 'Qty', 'Unit price', 'Total', 'Stock after', 'Notes', 'Entered by', 'Date', '']);
  for (const col of [1, 2, 3, 5, 7, 9, 10]) {
    expect(styles).toMatch(new RegExp(`#tab-history \\.tbl tr\\.hist-row > td:nth-child\\(${col}\\)\\{grid-column`));
  }
});

test('the Big Cartel gap warning really disappears when nothing is missing', () => {
  // bigcartel.js toggles the hidden attribute; a display rule on the strip
  // used to override it, so the warning showed even with no gaps.
  expect(document.getElementById('web-bc-gap-strip').hasAttribute('hidden')).toBe(true);
  expect(styles).toMatch(/\.bc-gap-strip\[hidden\]\{display:none;\}/);
});

test('phone pass: section heads wrap instead of squeezing their title', () => {
  const block = styles.slice(styles.indexOf('PHONE PASS, EVERY OTHER SCREEN'));
  expect(block).toMatch(/\.tab-panel \.sec-head\{flex-wrap:wrap;\}/);
  expect(block).toMatch(/\.tab-panel \.sec-head-titles\{flex:1 1 220px;\}/);
});

test('phone pass: Add sale keeps its save button in reach and tables keep their first column', () => {
  const block = styles.slice(styles.indexOf('PHONE PASS, EVERY OTHER SCREEN'));
  expect(block).toMatch(/#tab-manual \.card-actions \.btn\.gold\.lg\{\s*position:sticky;/);
  expect(block).toMatch(/\.tab-panel:not\(#tab-history\) \.tbl td:first-child\{position:sticky;left:0;/);
  // The Save-preset button on Shipping no longer forces a 28px height.
  expect(html).not.toMatch(/openSaveBookPresetModal\(\)" style="[^"]*height:28px/);
});

function segApi() {
  const src = slice('function buildPhoneSeg', 'refreshPhoneSegs();\n');
  return new Function(`${src}; return { refreshPhoneSegs, syncPhoneSegs };`)();
}

test('Add sale: tap buttons mirror each dropdown and drive it', () => {
  const pay = $('m-payment-type');
  pay.replaceChildren();
  ['', 'Card', 'Cash'].forEach((v) => pay.add(new Option(v || '— Select —', v)));
  const api = segApi();
  api.refreshPhoneSegs();
  const seg = pay.nextElementSibling;
  expect(seg.classList.contains('phone-seg')).toBe(true);
  // The empty "choose one" option never becomes a button.
  expect([...seg.querySelectorAll('.phone-seg-opt')].map((b) => b.dataset.value)).toEqual(['Card', 'Cash']);
  let changed = 0;
  pay.addEventListener('change', () => changed++);
  seg.querySelector('[data-value="Card"]').click();
  expect(pay.value).toBe('Card');
  expect(changed).toBe(1);
  expect(seg.querySelector('[data-value="Card"]').getAttribute('aria-checked')).toBe('true');
  // Clearing the form after a save un-highlights the buttons too.
  pay.value = '';
  api.syncPhoneSegs();
  expect(seg.querySelector('[aria-checked="true"]')).toBeNull();
  // Rebuilding (each time Add sale opens) never duplicates the row.
  api.refreshPhoneSegs();
  expect(pay.parentElement.querySelectorAll('.phone-seg').length).toBe(1);
});

test('Add sale: the form reset after saving re-syncs the buttons', () => {
  expect(mainJs).toMatch(/\$\('m-payment-type'\)\.value = ''; \$\('m-hint'\)\.textContent = ''; syncPhoneSegs\(\);/);
  expect(mainJs).toMatch(/if \(name === 'manual'\) refreshPhoneSegs\(\);/);
});

test('Add sale: Sale / Gift copy switch shows one form at a time, on phones only', () => {
  expect($('man-sale-sect').querySelector('[onclick="submitManual(event)"]')).not.toBeNull();
  expect($('man-gift-sect').querySelector('[onclick="submitGratuity(event)"]')).not.toBeNull();
  expect(styles).toMatch(/\.phone-mode-seg,\.phone-seg\{display:none;\}/);
  const block = styles.slice(styles.indexOf('ADD SALE, PHONE REDESIGN'));
  expect(block).toMatch(/#tab-manual:not\(\.is-gift\) #man-gift-sect,\s*#tab-manual\.is-gift #man-sale-sect\{display:none;\}/);
});
