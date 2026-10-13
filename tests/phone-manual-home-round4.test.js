import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

// Phone round 4: Manual entry (optional fields folded), the Home Sell card at
// night, the Home upload strip, and the History gratuity tag.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const phone = read('src/styles/phone.css');
const mainJs = read('src/main.js');

const SECTION = '/* ─── MANUAL ENTRY + HOME (round 4) ─── */';

describe('manual entry + home round 4 phone section', () => {
  it('is one commented section at the end of phone.css, with phone rules in a max-width media query', () => {
    const at = phone.indexOf(SECTION);
    expect(at).toBeGreaterThan(-1);
    expect(phone.indexOf(SECTION, at + 1)).toBe(-1);
    const section = phone.slice(at);
    expect(section).toMatch(/@media \(max-width: 768px\) \{/);
    expect(section.trimEnd().endsWith('}')).toBe(true);
  });

  it('uses no raw colour values in the new section', () => {
    const section = phone.slice(phone.indexOf(SECTION));
    expect(section).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(section).not.toMatch(/\brgba?\(/);
  });

  it('keeps the new section free of rounded corners on the upload strip', () => {
    const section = phone.slice(phone.indexOf(SECTION));
    expect(section).toMatch(/#tab-today \.fm-sync \{[^}]*border-radius: var\(--r2\)/);
    expect(section).not.toMatch(/#tab-today \.fm-sync \{[^}]*r-pill/);
  });
});

describe('manual entry markup', () => {
  it('folds Order # and Notes into a closed manual-more details', () => {
    const m = html.match(/<details class="manual-more" id="man-more">([\s\S]*?)<\/details>/);
    expect(m).not.toBeNull();
    expect(m[0]).toContain('<summary>More details (order number, notes)</summary>');
    expect(m[0]).toContain('id="m-num"');
    expect(m[0]).toContain('id="m-notes"');
    expect(m[0]).not.toMatch(/<details[^>]*\sopen[\s>]/);
  });

  it('keeps Qty, price, Channel and Payment type outside the fold', () => {
    const m = html.match(/<details class="manual-more" id="man-more">([\s\S]*?)<\/details>/);
    expect(m[0]).not.toContain('id="m-qty"');
    expect(m[0]).not.toContain('id="m-price"');
    expect(m[0]).not.toContain('id="m-chan"');
    expect(m[0]).not.toContain('id="m-payment-type"');
  });

  it('keeps the handler and ids unchanged', () => {
    expect(html).toContain('onclick="submitManual(event)"');
    expect(mainJs).toContain("const num = $('m-num').value.trim()");
    expect(mainJs).toContain("notes = $('m-notes').value.trim()");
  });
});

describe('history gratuity tag', () => {
  it('uses the neutral channel tag instead of the violet status chip', () => {
    expect(mainJs).toContain('<span class="ch-badge">🎁 Gratuity</span>');
    expect(mainJs).not.toContain('chip-status violet">🎁 Gratuity');
  });
});

describe('manual entry behaviour (real app)', () => {
  let app;
  const book = makeBook({ id: 'hb', title: 'Harbour Lights', currency: 'CA$', listPrice: 40, maxPrint: 100 });

  beforeAll(async () => {
    app = await loadApp({ books: [book] });
  }, 30000);

  beforeEach(async () => {
    await app.resetBook('hb', { hist: [], revenue: 0 });
    if (app.main.activeBook !== 'hb') app.window.switchBook('hb');
  });

  it('still records notes and order number when the details fold is closed', async () => {
    const details = document.getElementById('man-more');
    expect(details.open).toBe(false);
    document.getElementById('m-qty').value = '2';
    document.getElementById('m-price').value = '40';
    document.getElementById('m-num').value = 'FOLD-1';
    document.getElementById('m-chan').value = 'In Person';
    document.getElementById('m-notes').value = 'promo card';
    document.getElementById('m-payment-type').value = 'Payment directly to publisher';
    document.getElementById('m-price-cur').value = 'BOOK';
    await app.window.submitManual();
    await app.settle();
    const row = app.main.states.hb.hist[0];
    expect(row).toMatchObject({ num: 'FOLD-1', qty: 2 });
    expect(row.notes).toContain('promo card');
  });
});
