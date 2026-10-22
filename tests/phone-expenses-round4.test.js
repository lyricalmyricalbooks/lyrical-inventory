import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { appSource } from './helpers/extract-decl.js';

// Round 4 of the phone redesign, Expenses: compact expense cards, the edit-expense
// sheet (currency room, receipt button) and the batch sheet (labelled bulk bar,
// trip field above it). String assertions over the shipped files; the screens
// themselves are checked by `npm run shots`.
const read = (rel) => readFileSync(rel, 'utf8');
const phoneCss = read('src/styles/phone.css');
const phoneLayout = read('src/lib/phone-layout.js');
const indexHtml = read('index.html');
// main.js plus the feature and lib modules (the expense editor lives in features/tax-entries.js).
const mainJs = appSource;
const styleCss = read('src/style.css');

const MARK = '/* ─── EXPENSES (round 4) ─── */';
const section = () => phoneCss.slice(phoneCss.indexOf(MARK));

describe('expense card config', () => {
  it('summary shows only the date, receipt, amount and the select/actions cells', () => {
    expect(phoneLayout).toContain("'exp-body': { lead: 'Description', summary: ['Date', 'Receipt', 'Amount', ''] },");
  });

  it('Reimbursement and Amount (CAD) are no longer in the summary', () => {
    const line = phoneLayout.split('\n').find(l => l.includes("'exp-body'"));
    expect(line).not.toContain("'Reimbursement'");
    expect(line).not.toContain("'Amount (CAD)'");
  });
});

describe('EXPENSES (round 4) phone section', () => {
  it('is a single commented section at the end of phone.css', () => {
    expect(phoneCss.split(MARK)).toHaveLength(2);
    const after = section();
    // Its own rules run to the next section marker. A later round may add a
    // separately marked section after it, but never rules that sit inside this one.
    const next = after.indexOf('/* ───', MARK.length);
    const own = next === -1 ? after : after.slice(0, next);
    expect(own).toContain('@media (max-width: 768px)');
    expect(own.trimEnd().endsWith('}')).toBe(true);
  });

  it('uses Riso tokens only (no raw hex or rgb colours)', () => {
    const body = section();
    expect(body).not.toMatch(/#[0-9a-f]{3,8}(?![\w-])/i);
    expect(body).not.toMatch(/rgba?\(/i);
  });

  it('keeps the expense card scoped to the expense table', () => {
    expect(section()).toContain('#exp-body > tr.phone-record');
  });

  it('gives the remove control a full 44px box on phone', () => {
    expect(section()).toMatch(/#exp-body \.edit-btn \{[^}]*width: var\(--target-min\)/);
    expect(section()).toMatch(/#exp-body \.edit-btn \{[^}]*height: var\(--target-min\)/);
  });

  it('keeps actions behind Details except on a pending row', () => {
    expect(section()).toContain(':not(.phone-record-open):not(.is-awaiting) > td[data-phone-label="Actions"]');
  });

  it('gives the currency select room (min 88px) and clears the shared modal clamp', () => {
    expect(section()).toMatch(/\.modal \.form-group select\.exp-cur-select \{[^}]*min-width: 88px/);
  });
});

describe('edit-expense sheet', () => {
  it('no longer carries the inline 70px cap on the currency select', () => {
    const tag = indexHtml.match(/<select id="edit-exp-cur"[^>]*>/)[0];
    expect(tag).not.toContain('max-width');
    expect(tag).toContain('class="exp-cur-select"');
  });

  it('keeps the real file input focusable, labelled by a Choose receipt button', () => {
    expect(indexHtml).toMatch(/<input type="file" id="edit-exp-file" class="sr-only exp-file-input"/);
    expect(indexHtml).toContain('<label for="edit-exp-file" class="btn exp-file-btn">Choose receipt</label>');
    expect(indexHtml).toContain('id="edit-exp-file-name"');
  });

  it('keeps the camera button and its handler', () => {
    expect(indexHtml).toContain('onclick="openReceiptCameraModal()" id="edit-exp-cam-btn"');
  });

  it('shows the chosen file name on change, and resets it when the sheet opens', () => {
    expect(mainJs).toContain("$('edit-exp-file')?.addEventListener('change', syncEditExpFileName);");
    expect(mainJs).toMatch(/\$\('edit-exp-file'\)\.value = '';\s*syncEditExpFileName\(\);/);
  });

  it('draws the receipt button from the shared Riso classes', () => {
    expect(styleCss).toMatch(/\.exp-file-input:focus-visible \+ \.btn\.exp-file-btn\{outline:2px solid var\(--gold\)/);
  });
});

describe('batch expense sheet', () => {
  const bulkStart = indexHtml.indexOf('<div class="bx-toolbar">');
  const tripStart = indexHtml.indexOf('id="bx-trip-wrap"');

  it('labels each bulk control and renames the two Apply buttons', () => {
    expect(indexHtml).toContain('<span>Set category</span><select id="bx-bulk-cat"></select>');
    expect(indexHtml).toContain('<span>Set date</span><input type="date" id="bx-bulk-date">');
    expect(indexHtml).toContain('onclick="applyBatchExpenseBulk(\'category\')">Apply category</button>');
    expect(indexHtml).toContain('onclick="applyBatchExpenseBulk(\'date\')">Apply date</button>');
    const batch = indexHtml.slice(indexHtml.indexOf('id="m-batch-expense"'), indexHtml.indexOf('id="bx-rows"'));
    expect(batch).not.toMatch(/>Apply<\/button>/);
  });

  it('moves the trip / project field above the bulk bar', () => {
    expect(tripStart).toBeGreaterThan(-1);
    expect(bulkStart).toBeGreaterThan(-1);
    expect(tripStart).toBeLessThan(bulkStart);
  });

  it('keeps the trip input and its datalist under the same ids', () => {
    expect(indexHtml).toContain('<input type="text" id="bx-trip" list="bx-trip-options"');
    expect(indexHtml).toContain('<datalist id="bx-trip-options"></datalist>');
  });
});

describe('remove still asks first', () => {
  it('voidExpense goes through the confirm dialog', () => {
    const receipts = read('src/features/receipts.js');
    const fn = receipts.slice(receipts.indexOf('async function voidExpense('));
    expect(fn.slice(0, 600)).toContain('await confirmDialog(');
  });
});
