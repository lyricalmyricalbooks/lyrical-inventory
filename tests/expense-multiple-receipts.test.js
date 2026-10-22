// One expense, several receipts: the Expenses tab form takes more than one,
// every one is saved, the ledger opens each, and the publisher can attach more
// to an expense already logged. Old single-receipt expenses still show theirs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { MAX_RECEIPT_PICKS, mergeReceiptPicks, receiptLinkLabel, removeReceiptPick } from '../src/lib/receipt-picks.js';
import { createSandboxBackend } from '../src/lib/test-profile.js';
import { applyReceiptAddition, receiptAdditionApplied, receiptAdditionPayload, receiptRefName, removeExpenseReceipt } from '../src/lib/expense-receipts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOK = 'harbour';
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

const fileLike = (name, size = 10, lastModified = 1) => ({ name, size, lastModified, type: 'image/jpeg' });

describe('receipt picks', () => {
  it('adds new picks after the earlier ones and skips the same file picked twice', () => {
    const a = fileLike('a.jpg'), b = fileLike('b.pdf');
    const first = mergeReceiptPicks([], [a]);
    const second = mergeReceiptPicks(first.files, [fileLike('a.jpg'), b]);
    expect(second.files.map(f => f.name)).toEqual(['a.jpg', 'b.pdf']);
    expect(second.duplicates).toBe(1);
  });

  it('stops at the per-expense limit and says how many were left off', () => {
    const many = Array.from({ length: MAX_RECEIPT_PICKS + 2 }, (_, i) => fileLike(`r${i}.jpg`));
    const out = mergeReceiptPicks([], many);
    expect(out.files).toHaveLength(MAX_RECEIPT_PICKS);
    expect(out.overLimit).toBe(2);
  });

  it('removes one pick by position', () => {
    const list = [fileLike('a'), fileLike('b'), fileLike('c')];
    expect(removeReceiptPick(list, 1).map(f => f.name)).toEqual(['a', 'c']);
  });

  it('numbers links only when there are several', () => {
    expect(receiptLinkLabel(0, 1)).toBe('View');
    expect(receiptLinkLabel(1, 3)).toBe('View 2');
  });
});

describe('receipts on a logged expense', () => {
  it('names a receipt by its file, not its storage address', () => {
    expect(receiptRefName('local://Harbour/2026/Other/2026-03-01_invoice.pdf')).toBe('2026-03-01_invoice.pdf');
    expect(receiptRefName('https://firebasestorage.googleapis.com/v0/b/x/o/harbour%2F1761140000000_slip.jpg?alt=media')).toBe('slip.jpg');
  });

  it('folds an artist request into the expense once, skipping files it already has', () => {
    const expenses = [{ id: 3, desc: 'Fair', receipt: 'a', receiptFiles: ['a'] }];
    const raw = receiptAdditionPayload(expenses[0], ['a', 'b']);
    expect(raw.amount).toBe(0);
    const out = applyReceiptAddition(expenses, raw, 'expenses:k');
    expect(out.added).toBe(1);
    expect(expenses[0].receiptFiles).toEqual(['a', 'b']);
    expect(receiptAdditionApplied(expenses, 'expenses:k')).toBe(true);
    expect(applyReceiptAddition([], raw, 'x').reason).toBe('missing');
  });

  it('removes only the named receipt and keeps the single field in step', () => {
    const e = { receipt: 'a', receiptFiles: ['a', 'b'] };
    expect(removeExpenseReceipt(e, 'a')).toBe(true);
    expect(e).toMatchObject({ receipt: 'b', receiptFiles: ['b'] });
    expect(removeExpenseReceipt(e, 'zzz')).toBe(false);
  });
});

describe('Test Profile receipts', () => {
  it('keeps a picked receipt in the tab instead of refusing or reaching the cloud', async () => {
    const store = new Map();
    const backend = createSandboxBackend({ getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) });
    const url = await backend._fbUploadReceipt(new Blob(['x'], { type: 'image/jpeg' }));
    expect(url).toMatch(/^blob:/);
  });
});

describe('Expenses tab form', () => {
  it('lets the receipt picker take several files', () => {
    expect(html).toMatch(/<input type="file" id="exp-file" accept="image\/\*,\.pdf" multiple hidden/);
    expect(html).toContain('id="exp-file-list"');
  });
});

describe('Several receipts on one expense (publisher)', () => {
  let app, win, uploads;
  beforeAll(async () => {
    uploads = [];
    app = await loadApp({
      books: [makeBook({ id: BOOK })],
      overrides: {
        _fbUploadReceipt: async (file, path) => {
          uploads.push(path);
          return `https://firebasestorage.googleapis.com/v0/b/x/o/${encodeURIComponent(file.name)}`;
        },
      },
    });
    win = app.window;
    // jsdom has neither a settable FileList nor DataTransfer; browsers have both.
    globalThis.DataTransfer = win.DataTransfer = class { constructor() { this.files = []; this.items = { add: (f) => this.files.push(f) }; } };
  }, 30000);

  beforeEach(async () => {
    await app.resetBook(BOOK, { expenses: [] });
    if (app.main.activeBook !== BOOK) win.switchBook(BOOK);
    uploads.length = 0;
    win.expFileClear();
  });

  function pick(...names) {
    const input = document.getElementById('exp-file');
    Object.defineProperty(input, 'files', { configurable: true, writable: true, value: names.map(n => new win.File([n], n, { type: 'image/jpeg' })) });
    win.expFileChosen();
  }

  it('collects picks across two browses and shows a chip for each', () => {
    pick('invoice.jpg');
    pick('packing-slip.jpg');
    const chips = document.querySelectorAll('#exp-file-list .dz-file');
    expect(chips).toHaveLength(2);
    expect(document.getElementById('exp-dropzone-title').textContent).toBe('Add another receipt');
    // Remove the first; the second stays.
    win.expFileClear(null, 0);
    expect([...document.querySelectorAll('#exp-file-list .dz-fname')].map(n => n.textContent.trim())).toEqual(['packing-slip.jpg']);
  });

  it('saves every receipt on the logged expense, first one also in the single field', async () => {
    document.getElementById('exp-desc').value = 'Print run';
    document.getElementById('exp-amount').value = '120';
    pick('invoice.jpg', 'slip.jpg');
    pick('freight.pdf');
    await win.submitExpense();
    await app.settle();
    const exp = app.main.states[BOOK].expenses[0];
    expect(exp.receiptFiles).toHaveLength(3);
    expect(exp.receipt).toBe(exp.receiptFiles[0]);
    expect(uploads).toHaveLength(3);
    // The ledger row opens each one, and the form is empty again.
    const row = document.querySelector('#exp-body tr');
    expect(row.textContent).toContain('View 1');
    expect(row.textContent).toContain('View 3');
    expect(document.querySelectorAll('#exp-file-list .dz-file')).toHaveLength(0);
  });

  it('still shows an old single-receipt expense, with a way to manage it', async () => {
    await app.resetBook(BOOK, { expenses: [{ id: 1, desc: 'Old', cat: 'Other', amount: 5, currency: 'CAD', date: '2026-01-02', receipt: 'https://example.com/r.pdf' }] });
    win.renderExpenses();
    const row = document.querySelector('#exp-body tr');
    const link = row.querySelector('a[href="https://example.com/r.pdf"]');
    expect(link.textContent).toContain('View');
    expect(link.title).toBe('r.pdf');
    expect(row.querySelector('.exp-add-receipt').textContent).toBe('Manage');
  });

  function interceptPicker() {
    const realCreate = document.createElement.bind(document);
    const box = {};
    document.createElement = (tag) => {
      const el = realCreate(tag);
      if (tag === 'input') { box.picker = el; el.click = () => {}; document.createElement = realCreate; }
      return el;
    };
    return box;
  }

  it('attaches more receipts to an expense already in the ledger', async () => {
    await app.resetBook(BOOK, { expenses: [{ id: 7, desc: 'Fair table', cat: 'Other', amount: 40, currency: 'CAD', date: '2026-02-03', receipt: 'https://example.com/one.pdf' }] });
    win.renderExpenses();
    const box = interceptPicker();
    const done = win.addReceiptsToExpense(7);
    expect(box.picker.multiple).toBe(true);
    Object.defineProperty(box.picker, 'files', { value: [new win.File(['b'], 'two.jpg'), new win.File(['c'], 'three.jpg')] });
    box.picker.onchange();
    await done;
    await app.settle();
    const exp = app.main.states[BOOK].expenses[0];
    expect(exp.receiptFiles[0]).toBe('https://example.com/one.pdf');
    expect(exp.receiptFiles).toHaveLength(3);
    expect(exp.receipt).toBe('https://example.com/one.pdf');
    expect(app.cloud.lastSave(BOOK).state.expenses[0].receiptFiles).toHaveLength(3);
  });

  it('takes one wrong receipt off, keeping the others, after asking', async () => {
    await app.resetBook(BOOK, { expenses: [{ id: 9, desc: 'Freight', cat: 'Other', amount: 12, currency: 'CAD', date: '2026-03-01', receipt: 'https://example.com/a.jpg', receiptFiles: ['https://example.com/a.jpg', 'https://example.com/wrong.jpg'] }] });
    win.renderExpenses();
    win.openExpenseReceipts(9);
    expect(document.querySelectorAll('#exp-receipts-list .exp-receipt-item')).toHaveLength(2);
    const removing = win.removeReceiptFromExpense(1);
    await app.settle();
    app.answerConfirm(true);
    await removing;
    await app.settle();
    const exp = app.main.states[BOOK].expenses[0];
    expect(exp.receiptFiles).toEqual(['https://example.com/a.jpg']);
    expect(exp.receipt).toBe('https://example.com/a.jpg');
    expect(document.querySelectorAll('#exp-receipts-list .exp-receipt-item')).toHaveLength(1);
    win.closeM('exp-receipts');
  });

  it('turns an artist receipt request into receipts on the expense when approved', async () => {
    await app.resetBook(BOOK, { expenses: [{ id: 11, desc: 'Booth', cat: 'Other', amount: 30, currency: 'CAD', date: '2026-04-01', receipt: 'https://example.com/one.pdf' }] });
    const payload = receiptAdditionPayload({ id: 11, desc: 'Booth', currency: 'CAD' }, ['https://example.com/forgot.jpg']);
    win.authorSubmissions[BOOK] = { expenses: { sub1: { data: JSON.stringify(payload) } } };
    win.renderExpenses();
    const pending = document.querySelector('#exp-body tr.is-awaiting');
    expect(pending.textContent).toContain('Adds receipts');
    await win.approveSubmission('expenses', 'sub1');
    await app.settle();
    const exps = app.main.states[BOOK].expenses;
    expect(exps).toHaveLength(1);
    expect(exps[0].receiptFiles).toEqual(['https://example.com/one.pdf', 'https://example.com/forgot.jpg']);
    win.authorSubmissions[BOOK] = {};
  });
});
