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

  it('still shows an old single-receipt expense', async () => {
    await app.resetBook(BOOK, { expenses: [{ id: 1, desc: 'Old', cat: 'Other', amount: 5, currency: 'CAD', date: '2026-01-02', receipt: 'https://example.com/r.pdf' }] });
    win.renderExpenses();
    const row = document.querySelector('#exp-body tr');
    expect(row.querySelector('a[href="https://example.com/r.pdf"]').textContent).toBe('View');
    expect(row.querySelector('.exp-add-receipt')).not.toBeNull();
  });

  it('attaches more receipts to an expense already in the ledger', async () => {
    await app.resetBook(BOOK, { expenses: [{ id: 7, desc: 'Fair table', cat: 'Other', amount: 40, currency: 'CAD', date: '2026-02-03', receipt: 'https://example.com/one.pdf' }] });
    win.renderExpenses();
    const realCreate = document.createElement.bind(document);
    let picker;
    document.createElement = (tag) => {
      const el = realCreate(tag);
      if (tag === 'input') { picker = el; el.click = () => {}; }
      return el;
    };
    try { await win.addReceiptsToExpense(7); } finally { document.createElement = realCreate; }
    expect(picker.multiple).toBe(true);
    Object.defineProperty(picker, 'files', { value: [new win.File(['b'], 'two.jpg'), new win.File(['c'], 'three.jpg')] });
    await picker.onchange();
    await app.settle();
    const exp = app.main.states[BOOK].expenses[0];
    expect(exp.receiptFiles[0]).toBe('https://example.com/one.pdf');
    expect(exp.receiptFiles).toHaveLength(3);
    expect(exp.receipt).toBe('https://example.com/one.pdf');
    expect(app.cloud.lastSave(BOOK).state.expenses[0].receiptFiles).toHaveLength(3);
  });
});
