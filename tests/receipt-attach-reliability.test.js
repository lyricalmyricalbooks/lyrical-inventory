// @vitest-environment jsdom
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { receiptRefName } from '../src/lib/expense-receipts.js';

let app;
let win;

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: 'harbour', title: 'Harbour Lights' })] });
  win = app.window;
  win.switchTab('taxcenter');
}, 30000);

beforeEach(async () => {
  await app.resetBook('harbour', { hist: [], expenses: [] });
  app.main.TAX_CENTER.businessExpenses = [];
  app.setOnline(true);
});

afterEach(() => {
  app.setOnline(true);
  vi.restoreAllMocks();
});

function setFilesOnInput(input, files) {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: files,
  });
}

describe('edit-expense receipt saving & UI', () => {
  it('falls back to cloud via saveReceiptBestEffort, attaches multiple files, and stamps receiptCloudAt', async () => {
    const uploaded = [];
    win._fbUploadReceipt = async (file, path, opts) => {
      uploaded.push({ name: file.name, path, contentType: opts?.contentType });
      return `https://firebasestorage.googleapis.com/v0/b/x/o/receipts%2F${encodeURIComponent(path)}?alt=media&token=abc`;
    };

    app.main.TAX_CENTER.businessExpenses = [
      { id: 'exp-1', desc: 'Google AI Pro', cat: 'Software & Subscriptions', amount: 30.5, currency: 'CAD', baseAmount: 30.5, date: '2026-11-27' },
    ];

    win.openEditExpense('businessExpense', '', 'exp-1');
    const file1 = new File(['img1'], 'receipt-1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['pdf2'], 'invoice-2.pdf', { type: '' });
    setFilesOnInput(document.getElementById('edit-exp-file'), [file1, file2]);
    document.getElementById('edit-exp-file').dispatchEvent(new Event('change'));
    expect(document.getElementById('edit-exp-file-name').textContent).toBe('2 files chosen');
    expect(document.getElementById('edit-exp-file-clear').hidden).toBe(false);

    await win.saveExpenseEdit();
    await app.settle();

    const saved = app.main.TAX_CENTER.businessExpenses[0];
    expect(uploaded).toHaveLength(2);
    expect(uploaded[0].contentType).toBe('image/jpeg');
    expect(uploaded[1].contentType).toBe('application/pdf');
    expect(saved.receiptFiles).toHaveLength(2);
    expect(saved.receipt).toBe(saved.receiptFiles[0]);
    expect(saved.receiptCloudAt).toBeTruthy();
    expect(document.getElementById('m-edit-expense').style.display).toBe('none');
  });

  it('prompts with the failure reason instead of silently dropping a receipt, and stays open on Keep editing', async () => {
    win._fbUploadReceipt = async () => {
      throw new Error('Permission denied for cloud receipt upload — make sure you are signed in.');
    };

    app.main.TAX_CENTER.businessExpenses = [
      { id: 'exp-2', desc: 'Fonts', cat: 'Software & Subscriptions', amount: 25, currency: 'CAD', baseAmount: 25, date: '2026-11-27' },
    ];

    win.openEditExpense('businessExpense', '', 'exp-2');
    const file = new File(['img'], 'receipt.png', { type: 'image/png' });
    setFilesOnInput(document.getElementById('edit-exp-file'), [file]);

    const savePromise = win.saveExpenseEdit();
    await app.settle();
    expect(document.getElementById('m-confirm').style.display).toBe('flex');
    expect(document.getElementById('m-confirm-body').textContent).toContain('Permission denied');
    await app.answerConfirm(false);
    await savePromise;

    // Modal stays open and expense was not modified without user consent
    expect(document.getElementById('m-edit-expense').style.display).toBe('flex');
    expect(app.main.TAX_CENTER.businessExpenses[0].receiptFiles).toBeUndefined();
    const saveBtn = document.querySelector('#m-edit-expense .modal-footer .gold');
    expect(saveBtn.disabled).toBe(false);
  });

  it('renders clean filenames for cloud receipt URLs and updates receipt signature on remove', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/lyrical/o/receipts%2FGeneral%2F1795828754289_Google_Play_Receipt.pdf?alt=media&token=xyz';
    app.main.TAX_CENTER.businessExpenses = [
      { id: 'exp-3', desc: 'Google Play', cat: 'Software & Subscriptions', amount: 30.5, currency: 'CAD', baseAmount: 30.5, date: '2026-11-27', receipt: url, receiptFiles: [url] },
    ];

    win.openEditExpense('businessExpense', '', 'exp-3');
    const preview = document.getElementById('edit-exp-receipts-preview');
    const link = preview.querySelector('a');
    expect(link).not.toBeNull();
    expect(link.textContent).toBe('Google_Play_Receipt.pdf');
    expect(link.textContent).not.toContain('alt=media');

    const sigBefore = document.getElementById('edit-exp-receipts-sig').value;
    win.removeEditExpenseReceipt(0);
    const sigAfter = document.getElementById('edit-exp-receipts-sig').value;
    expect(sigAfter).not.toBe(sigBefore);
    expect(preview.textContent).toContain('No receipts attached');
  });
});

describe('submitTaxExpense reliability', () => {
  it('restores the submit button and surfaces the error reason when receipt saving fails', async () => {
    win._fbUploadReceipt = async () => {
      throw new Error('Only image (JPG, PNG, WebP, HEIC) and PDF receipts can be saved to the cloud.');
    };

    document.getElementById('tc-exp-desc').value = 'Google Play';
    document.getElementById('tc-exp-cat').value = 'Software & Subscriptions';
    document.getElementById('tc-exp-cur').value = 'CAD';
    document.getElementById('tc-exp-amount').value = '30.50';
    document.getElementById('tc-exp-date').value = '2026-11-27';
    setFilesOnInput(document.getElementById('tc-exp-file'), [new File(['hello'], 'receipt.jpg', { type: 'image/jpeg' })]);

    const p = win.submitTaxExpense();
    await app.settle();
    expect(document.getElementById('m-confirm').style.display).toBe('flex');
    await app.answerConfirm(false);
    await p;

    const btn = document.getElementById('tc-submit-exp-btn');
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toBe('Log Business Expense');
  });
});

describe('uploadReceiptToCloud and saveReceiptBestEffort contracts', () => {
  it('fails fast when offline, infers MIME from the extension, and rejects unsupported types', async () => {
    const calls = [];
    win._fbUploadReceipt = async (_file, path, opts) => {
      calls.push(opts?.contentType);
      return `https://firebasestorage.googleapis.com/v0/b/x/o/${encodeURIComponent(path)}`;
    };

    app.setOnline(false);
    await expect(win.uploadReceiptToCloud(new File(['a'], 'r.jpg', { type: 'image/jpeg' }), 'General'))
      .rejects.toThrow(/offline/i);
    expect(calls).toEqual([]);

    app.setOnline(true);
    await win.uploadReceiptToCloud(new File(['pdf'], 'invoice.pdf', { type: '' }), 'General');
    expect(calls).toEqual(['application/pdf']);

    await expect(win.uploadReceiptToCloud(new File(['<html></html>'], 'receipt.html', { type: 'text/html' }), 'General'))
      .rejects.toThrow(/Only image/i);
  });

  it('falls back to the cloud with no folder connected and reports why when that fails too', async () => {
    win._fbUploadReceipt = async () => 'https://firebasestorage.googleapis.com/v0/b/x/o/r.jpg';
    const ok = await win.saveReceiptBestEffort(new File(['x'], 'r.jpg', { type: 'image/jpeg' }), 'General', {});
    expect(ok.storage).toBe('cloud');
    expect(ok.ref).toContain('firebasestorage');

    win._fbUploadReceipt = async () => { throw new Error('boom'); };
    const bad = await win.saveReceiptBestEffort(new File(['x'], 'r.jpg', { type: 'image/jpeg' }), 'General', {});
    expect(bad).toMatchObject({ storage: 'none', ref: '', error: 'boom' });
  });

  it('receiptRefName keeps readable filenames from encoded Firebase URLs', () => {
    expect(receiptRefName('https://firebasestorage.googleapis.com/v0/b/x/o/receipts%2FGeneral%2F1795828754289_Order.pdf?alt=media&token=123')).toBe('Order.pdf');
  });
});
