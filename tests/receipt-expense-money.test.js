// @vitest-environment jsdom
// Receipts becoming expenses, driven through the real app: drop receipts on
// the batch sheet (or attach one to the Tax Centre form), let the AI reader
// fill them in, and log them. Checked: the amount, category and Canadian value
// each expense is filed at, where its receipt went, and the totals.
//
// Nothing leaves the test: the AI reader and the exchange-rate services are
// answered by a fake `fetch`, and the cloud receipt upload by a fake.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'harbour';
let app;
let win;
let uploads = [];
let aiCalls = 0;

/**
 * What the AI reader says about each receipt, keyed by the receipt's contents,
 * plus the exchange rates that exist (`USD@2025-03-10`); everything else fails
 * like no network.
 */
function fakeServices({ readings = {}, byDate = {} } = {}) {
  const byBase64 = Object.fromEntries(Object.entries(readings).map(([text, r]) => [btoa(text), r]));
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const json = (body) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body });
    const missing = { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
    if (u.hostname === 'generativelanguage.googleapis.com') {
      if (!u.pathname.endsWith(':generateContent')) return missing; // the model list
      aiCalls++;
      const parts = JSON.parse(init.body).contents[0].parts;
      const image = parts.find(p => p.inline_data)?.inline_data.data;
      const reading = byBase64[image];
      if (!reading) return json({ candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }] });
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reading) }] }, finishReason: 'STOP' }] });
    }
    if (u.hostname === 'api.frankfurter.dev' && u.pathname.startsWith('/v1/')) {
      const rate = byDate[`${u.searchParams.get('from')}@${u.pathname.slice('/v1/'.length)}`];
      return rate ? json({ rates: { CAD: rate } }) : missing;
    }
    throw new Error('network disabled in tests');
  }));
}

const receipt = (text, name = `${text}.jpg`) => new window.File([text], name, { type: 'image/jpeg' });
const tc = () => app.main.TAX_CENTER;
const book = () => app.main.states[BOOK];

/** Drop files on the batch sheet the way a drag from the desktop does. */
function dropOnBatch(files) {
  win.batchExpenseDrop({ preventDefault() {}, dataTransfer: { files } });
}
const rowInput = (n, field) => document.querySelectorAll(`#bx-rows [data-bx-field="${field}"]`)[n];

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: BOOK, title: 'Harbour Lights', currency: 'CA$' })] });
  win = app.window;
  // No receipts folder in a test: receipts go to the cloud, here a fake one.
  win._fbUploadReceipt = async (file, path) => { uploads.push({ name: file.name, path }); return `https://files.example/${path}`; };
}, 30000);

beforeEach(async () => {
  await app.resetBook(BOOK, { expenses: [], hist: [] });
  tc().businessExpenses = [];
  tc().expenseRules = [];
  tc().settings.geminiKey = 'reader-key';
  uploads = [];
  aiCalls = 0;
  try { localStorage.removeItem('lm_receipt_scan_memory'); } catch { /* none */ }
  if (app.main.activeBook !== BOOK) win.switchBook(BOOK);
});

afterEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in tests'))));
});

describe('a pile of receipts logged to the business ledger', () => {
  it('files each at the amount and category read, converted at its own date\'s rate', async () => {
    fakeServices({
      readings: {
        'lulu-proof': { vendor: 'Lulu', description: 'Proof copies', date: '2026-02-11', amount: 64.2, currency: 'CAD', category: 'Printing & Production', confidence: 0.95 },
        'mailchimp-mar': { vendor: 'Mailchimp', description: 'Newsletter plan', date: '2025-03-10', amount: 20, currency: 'USD', category: 'Marketing & Advertising', confidence: 0.9 },
      },
      byDate: { 'USD@2025-03-10': 1.43 },
    });
    win.openBatchExpenseModal('business');
    dropOnBatch([receipt('lulu-proof'), receipt('mailchimp-mar')]);
    await win.scanAllBatchExpenses();
    expect(aiCalls).toBe(2);

    // The sheet shows what was read, for checking before logging.
    expect(rowInput(0, 'amount').value).toBe('64.20');
    expect(rowInput(1, 'amount').value).toBe('20.00');
    expect(rowInput(1, 'currency').value).toBe('USD');
    expect(document.getElementById('bx-submit-btn').textContent).toBe('Log 2 expenses');

    await win.submitBatchExpenses();
    await app.settle();

    const byDesc = Object.fromEntries(tc().businessExpenses.map(e => [e.desc, e]));
    expect(Object.keys(byDesc).sort()).toEqual(['Lulu — Proof copies', 'Mailchimp — Newsletter plan']);
    expect(byDesc['Lulu — Proof copies']).toMatchObject({
      cat: 'Printing & Production', currency: 'CAD', amount: 64.2, fxRate: 1, baseAmount: 64.2, date: '2026-02-11',
    });
    expect(byDesc['Mailchimp — Newsletter plan']).toMatchObject({
      cat: 'Marketing & Advertising', currency: 'USD', amount: 20, fxRate: 1.43, baseAmount: 28.6, date: '2025-03-10',
    });
    // Two saves landing in the same moment still get their own ids.
    expect(new Set(tc().businessExpenses.map(e => e.id)).size).toBe(2);
    // Each receipt went to the cloud (no folder here) and the entry says so.
    expect(uploads.map(u => u.name).sort()).toEqual(['lulu-proof.jpg', 'mailchimp-mar.jpg']);
    for (const e of tc().businessExpenses) {
      expect(e.receipt).toMatch(/^https:\/\/files\.example\/General\//);
      expect(typeof e.receiptCloudAt).toBe('string');
    }
    expect(app.cloud.settings.taxCenter.businessExpenses).toHaveLength(2);
    // And the Tax Centre adds them up in Canadian dollars.
    win.tcYearChange('all');
    expect(document.getElementById('tc-expenses').textContent).toBe('CA$92.80');
  });

  it('will not log a receipt the reader could not read until it is filled in by hand', async () => {
    fakeServices({ readings: {} });
    win.openBatchExpenseModal('business');
    dropOnBatch([receipt('smudged')]);
    await win.scanAllBatchExpenses();
    expect(document.querySelector('#bx-rows .bx-status').textContent).toMatch(/Could not read/);

    await win.submitBatchExpenses();
    expect(tc().businessExpenses).toEqual([]);
    expect(app.toast()).toMatch(/needs a description and an amount/);

    for (const [field, value] of [['vendor', 'Staples'], ['amount', '18.40'], ['category', 'Office Supplies'], ['date', '2026-01-20']]) {
      const el = rowInput(0, field);
      el.value = value;
      el.dispatchEvent(new window.Event('change'));
    }
    await win.submitBatchExpenses();
    await app.settle();
    expect(tc().businessExpenses).toHaveLength(1);
    expect(tc().businessExpenses[0]).toMatchObject({ desc: 'Staples', cat: 'Office Supplies', amount: 18.4, currency: 'CAD', baseAmount: 18.4, date: '2026-01-20' });
  });

  it('asks before logging a receipt that is already in the ledger, and logs nothing on "no"', async () => {
    tc().businessExpenses = [{ id: 1, desc: 'Lulu — Proof copies', cat: 'Printing & Production', currency: 'CAD', amount: 64.2, fxRate: 1, baseAmount: 64.2, date: '2026-02-11' }];
    fakeServices({
      readings: { 'lulu-again': { vendor: 'Lulu', description: 'Proof copies', date: '2026-02-11', amount: 64.2, currency: 'CAD', category: 'Printing & Production', confidence: 0.95 } },
    });
    win.openBatchExpenseModal('business');
    dropOnBatch([receipt('lulu-again')]);
    await win.scanAllBatchExpenses();
    expect(document.querySelector('#bx-rows .bx-flag-warn').textContent).toMatch(/already in the ledger/);

    const done = win.submitBatchExpenses();
    await app.answerConfirm(false);
    await done;
    expect(tc().businessExpenses).toHaveLength(1);
    expect(uploads).toEqual([]);
  });
});

describe('a pile of receipts logged to a book', () => {
  it('files a Canadian receipt on the book\'s own expense list', async () => {
    fakeServices({
      readings: { 'cover-art': { vendor: 'Ink & Line Studio', description: 'Cover illustration', date: '2026-01-05', amount: 300, currency: 'CAD', category: 'Illustration & Photography', confidence: 0.92 } },
    });
    win.openBatchExpenseModal('project');
    dropOnBatch([receipt('cover-art')]);
    await win.scanAllBatchExpenses();
    await win.submitBatchExpenses();
    await app.settle();

    expect(tc().businessExpenses).toEqual([]);
    expect(book().expenses).toHaveLength(1);
    expect(book().expenses[0]).toMatchObject({
      desc: 'Ink & Line Studio — Cover illustration', cat: 'Illustration & Photography',
      amount: 300, currency: 'CAD', origAmount: 300, origCurrency: 'CAD', baseAmount: 300, date: '2026-01-05',
    });
    expect(book().expenses[0].receipt).toMatch(/^https:\/\/files\.example\/Harbour_Lights\//);
    expect(app.cloud.lastSave(BOOK).state.expenses[0]).toMatchObject({ amount: 300, baseAmount: 300 });
  });

  // BUG: the book side of the batch converts a foreign receipt at TODAY's rate
  // (whatever `USD_CAD` is cached, e.g. from the register's rate refresh),
  // never the rate for the receipt's own date. The business side of the same
  // sheet and the Tax Centre form use the receipt's date (resolveExpenseRate).
  // src/features/receipts.js, _postBatchToProjectLedger:
  // `const rate = _fxRateCache[`${origCurrency}_${native}`]`.
  it.fails('converts a back-dated foreign receipt at the rate for its own date, as the business side does', async () => {
    fakeServices({
      readings: { 'us-printer': { vendor: 'IngramSpark', description: 'Setup fee', date: '2025-03-10', amount: 100, currency: 'USD', category: 'Printing & Production', confidence: 0.95 } },
      byDate: { 'USD@2025-03-10': 1.43 },
    });
    // Today's rate is already on the device, as it is once the register has
    // refreshed its rates.
    app.main._fxRateCache.USD_CAD = 1.36;
    try {
      win.openBatchExpenseModal('project');
      dropOnBatch([receipt('us-printer')]);
      await win.scanAllBatchExpenses();
      await win.submitBatchExpenses();
      await app.settle();

      // Filed today it is 136.00 (today's 1.36), not 143.00 (1.43 on 10 March 2025).
      expect(book().expenses[0]).toMatchObject({ origAmount: 100, origCurrency: 'USD', baseAmount: 143 });
    } finally {
      delete app.main._fxRateCache.USD_CAD;
    }
  });
});

describe('one receipt read into the Tax Centre form', () => {
  it('fills the form from the receipt, and logging it files what was read', async () => {
    fakeServices({
      readings: { 'flight-yyz': { vendor: 'Porter Airlines', description: 'Flight to the book fair', date: '2025-03-10', amount: 250, currency: 'USD', category: 'Travel', confidence: 0.97 } },
      byDate: { 'USD@2025-03-10': 1.43 },
    });
    win.switchTab('taxcenter');
    const input = document.getElementById('tc-exp-file');
    Object.defineProperty(input, 'files', { configurable: true, writable: true, value: [receipt('flight-yyz')] });

    await win.scanReceiptWithAI();
    expect(document.getElementById('tc-exp-desc').value).toBe('Porter Airlines — Flight to the book fair');
    expect(document.getElementById('tc-exp-amount').value).toBe('250.00');
    expect(document.getElementById('tc-exp-cur').value).toBe('USD');
    expect(document.getElementById('tc-exp-date').value).toBe('2025-03-10');
    expect(document.getElementById('tc-exp-cat').value).toBe('Travel');
    expect(tc().businessExpenses).toEqual([]); // nothing filed until Log is pressed

    await win.submitTaxExpense();
    await app.settle();
    expect(tc().businessExpenses).toHaveLength(1);
    expect(tc().businessExpenses[0]).toMatchObject({
      desc: 'Porter Airlines — Flight to the book fair', cat: 'Travel', currency: 'USD', amount: 250,
      fxRate: 1.43, baseAmount: 357.5, date: '2025-03-10',
    });
    expect(tc().businessExpenses[0].receipt).toMatch(/^https:\/\/files\.example\/General\/.*flight-yyz\.jpg$/);
    Object.defineProperty(input, 'files', { configurable: true, writable: true, value: [] });
  });
});
