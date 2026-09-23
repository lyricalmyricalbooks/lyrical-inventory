import { describe, it, expect, beforeEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { buildHarness } from './helpers/extract-decl.js';

// Covers the scanner reading less: a receipt already read confidently is
// answered from memory (no upload, no AI allowance, works offline), the photo
// is shrunk once per attachment rather than once per tap, and the instructions
// sent with every scan stay short without losing the rules that matter.

// The test page has no browser hashing of its own; a real browser does.
vi.stubGlobal('crypto', webcrypto);

const CATS = ['Office Supplies', 'Shipping & Postage', 'Other'];

// A stand-in for a File: the fingerprint only needs the bytes.
const fakeFile = (text) => {
  const bytes = new TextEncoder().encode(text);
  return { name: 'r.jpg', size: bytes.length, type: 'image/jpeg', arrayBuffer: async () => bytes.buffer };
};

function memoryHarness({ reply, prepare } = {}) {
  const calls = [];
  const prepared = [];
  const api = buildHarness({
    names: [
      '_extractReceiptFromFile', '_prepareReceiptUploadOnce', '_receiptUploadMemo',
      '_receiptFingerprintMemo', '_receiptScanFingerprint',
      'RECEIPT_SCAN_MEMORY_KEY', 'RECEIPT_SCAN_MEMORY_MAX', '_receiptScanMemorySignature',
      '_receiptScanMemoryLoad', '_receiptScanRecall', '_receiptScanRemember',
      'warmReceiptScan', '_buildReceiptScanPrompt', 'RECEIPT_SCAN_SCHEMA'
    ],
    deps: {
      EXPENSE_CATEGORIES: CATS,
      TAX_CENTER: { settings: { geminiKey: 'k' } },
      localStorage: globalThis.localStorage,
      DOMException,
      _prepareReceiptUpload: async (file) => {
        prepared.push(file);
        if (prepare) return prepare(file);
        return { mime: 'image/jpeg', base64: 'AAAA', scaled: true };
      },
      _callAiForReceipts: async (key, parts, opts) => {
        calls.push({ key, parts, opts });
        return { text: JSON.stringify(typeof reply === 'function' ? reply() : reply) };
      },
      _parseReceiptJson: text => JSON.parse(text),
      _parseReceiptAmount: v => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^0-9.-]/g, '')) || 0),
      normalizeReceiptDate: s => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? s : '')
    },
    moduleState: 'let _receiptScanMemory = null;',
    returns: '{ extract: _extractReceiptFromFile, warm: warmReceiptScan, prompt: _buildReceiptScanPrompt }'
  });
  return { ...api, calls, prepared };
}

const flush = () => new Promise(r => setTimeout(r, 0));

const clean = { vendor: 'Staples', date: '2026-09-01', amount: 42.5, currency: 'CAD', category: 'Office Supplies', confidence: 0.92 };

describe('receipt scan memory', () => {
  beforeEach(() => localStorage.clear());

  it('answers a second scan of the same receipt without calling the AI', async () => {
    const h = memoryHarness({ reply: clean });
    const first = await h.extract('k', fakeFile('receipt-A'));
    const again = await h.extract('k', fakeFile('receipt-A')); // same bytes, new File

    expect(h.calls).toHaveLength(1);
    expect(first.fromMemory).toBeUndefined();
    expect(again).toMatchObject({ ...clean, fromMemory: true });
    // Recognised by content, so the second copy was never even shrunk.
    expect(h.prepared).toHaveLength(1);
  });

  it('survives a reload, so a receipt read yesterday is still free today', async () => {
    await memoryHarness({ reply: clean }).extract('k', fakeFile('receipt-A'));
    const later = memoryHarness({ reply: clean }); // fresh module state
    await later.extract('k', fakeFile('receipt-A'));
    expect(later.calls).toHaveLength(0);
  });

  it('never mistakes a different receipt for a remembered one', async () => {
    const h = memoryHarness({ reply: clean });
    await h.extract('k', fakeFile('receipt-A'));
    await h.extract('k', fakeFile('receipt-B'));
    expect(h.calls).toHaveLength(2);
  });

  it.each([
    ['a low-confidence read', { ...clean, confidence: 0.3 }],
    ['a read with no total', { ...clean, amount: 0 }],
    ['a read with no usable date', { ...clean, date: 'sometime in March' }]
  ])('keeps %s re-scannable instead of remembering it', async (_label, shaky) => {
    // Tapping again on a blurry photo is asking for a second look.
    const h = memoryHarness({ reply: shaky });
    await h.extract('k', fakeFile('blurry'));
    await h.extract('k', fakeFile('blurry'));
    expect(h.calls).toHaveLength(2);
  });

  it('forgets everything when the scan instructions change', async () => {
    await memoryHarness({ reply: clean }).extract('k', fakeFile('receipt-A'));
    const saved = JSON.parse(localStorage.getItem('lm_receipt_scan_memory'));
    localStorage.setItem('lm_receipt_scan_memory', JSON.stringify({ ...saved, sig: 'old-rules' }));

    const h = memoryHarness({ reply: clean });
    await h.extract('k', fakeFile('receipt-A'));
    expect(h.calls).toHaveLength(1);
  });

  it('shrugs off unreadable storage and just scans', async () => {
    localStorage.setItem('lm_receipt_scan_memory', '{not json');
    const h = memoryHarness({ reply: clean });
    await expect(h.extract('k', fakeFile('receipt-A'))).resolves.toMatchObject({ amount: 42.5 });
    expect(h.calls).toHaveLength(1);
  });

  it('stays bounded, dropping the least recently used receipt first', async () => {
    const h = memoryHarness({ reply: clean });
    for (let i = 0; i < 152; i++) await h.extract('k', fakeFile(`r-${i}`));
    const saved = JSON.parse(localStorage.getItem('lm_receipt_scan_memory'));
    expect(saved.entries).toHaveLength(150);
    // Nothing but the answer is stored — no photo, no marker.
    expect(saved.entries[0][1]).toEqual(clean);
  });
});

describe('receipt scan warm-up', () => {
  beforeEach(() => localStorage.clear());

  it('prepares the photo on attach so the scan reuses it', async () => {
    const h = memoryHarness({ reply: clean });
    const file = fakeFile('fresh');
    h.warm(file);
    await flush();
    expect(h.prepared).toHaveLength(1);

    await h.extract('k', file);
    expect(h.prepared).toHaveLength(1); // not shrunk a second time
    expect(h.calls).toHaveLength(1);
  });

  it('does no work for a receipt it already knows', async () => {
    const h = memoryHarness({ reply: clean });
    await h.extract('k', fakeFile('known'));
    h.warm(fakeFile('known'));
    await flush();
    expect(h.prepared).toHaveLength(1);
  });
});

describe('receipt scan instructions', () => {
  it('stays short, since every word is paid for on every scan', () => {
    const text = memoryHarness({ reply: clean }).prompt();
    // The previous wording ran to ~2,000 characters.
    expect(text.length).toBeLessThan(1450);
  });

  it('keeps every rule that decides which figure lands in the ledger', () => {
    const text = memoryHarness({ reply: clean }).prompt();
    expect(text).toMatch(/grand total/i);
    expect(text).toMatch(/never the subtotal/i);
    expect(text).toMatch(/not the due date/i);
    expect(text).toMatch(/GST\/HST\/QST/);
    expect(text).toMatch(/YYYY-MM-DD/);
    expect(text).toMatch(/below 0\.4/);
    expect(text).toMatch(/Never the sender/);
    expect(text).toMatch(/Tracking Number/);
  });
});
