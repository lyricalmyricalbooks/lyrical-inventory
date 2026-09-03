import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHarness } from './helpers/extract-decl.js';

const INDEX_HTML = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.html'), 'utf8'
);

// Covers the batch expense sheet: staging a pile of receipts, reading them all
// in one pass, and posting them to a ledger together.
//
// The risks a batch adds over the one-at-a-time form are all about *plurality* —
// ids that collide because two rows saved in the same millisecond, a duplicate
// check that only catches the first of three copies, one unreadable photo
// discarding the readings of the twelve beside it, and a currency conversion
// applied to some rows but not others. Those are what this file pins down.

const TC_CATS = ['Software & Subscriptions', 'Travel & Meals', 'Office Supplies', 'Artist Royalties', 'Other'];
const EXP_CATS = ['Software & Subscriptions', 'Travel & Meals', 'Office Supplies', 'Sales Processing Fees', 'Other'];

function file(name = 'receipt.jpg') {
  return new File([new Uint8Array(32)], name, { type: 'image/jpeg' });
}

/**
 * Lift the batch logic out of main.js and run it against injected doubles.
 * Only the rendering functions are stubbed — every rule under test (dedupe,
 * conversion, id allocation, receipt fallbacks) is the real code.
 */
function harness({
  taxCenter,
  bookState,
  book = { title: 'Bramble & Bee', currency: 'CAD' },
  author = false,
  rates = {},
  extract,
  submitActivity,
  saveReceipt = async () => ({ ref: 'local://General/r.jpg', storage: 'local' }),
  uploadCloud = async () => 'https://cloud/r.jpg',
  confirmAnswer = true,
  trip = ''
} = {}) {
  const toasts = [];
  const logs = [];
  const saved = { taxCenter: 0, state: 0 };
  const notified = [];
  const fxFetches = [];

  const h = buildHarness({
    names: [
      'BATCH_EXPENSE_CURRENCIES', 'BATCH_SCAN_CONCURRENCY', '_batchExpenseCurrencies',
      'batchExpenseDestinations', '_batchExpenseDefaultCurrency', '_batchExpenseCategories',
      '_batchExpenseNewRow', '_batchExpenseRow', '_batchExpenseDescription',
      '_batchExpenseDuplicate', 'toggleAllBatchExpenses', 'deselectDuplicateBatchExpenses',
      '_applyBatchScanResult', '_warmBatchExpenseRates', 'scanAllBatchExpenses', '_friendlyScanError',
      'submitBatchExpenses', '_postBatchToBusinessLedger', '_postBatchToProjectLedger',
      '_runExtractionPool'
    ],
    deps: {
      // ── rendering: stubbed, since none of it is what's under test here
      $: (id) => (id === 'bx-trip' ? { value: trip } : null),
      renderBatchExpenseRows: () => {},
      renderBatchExpenseModal: () => {},
      _repaintBatchExpenseStatuses: () => {},
      _paintBatchExpenseRow: () => {},
      _updateBatchExpenseSummary: () => {},
      _batchExpenseProgress: () => {},
      closeBatchExpenseModal: () => {},
      renderTaxCenter: () => {},
      renderExpenses: () => {},
      updateDash: () => {},
      escapeHtml: (s) => String(s ?? ''),
      localStorage: { getItem: () => null, setItem: () => {} },
      document: { querySelector: () => null },

      // ── app state
      TAX_CENTER: taxCenter,
      TC_CATEGORIES: TC_CATS,
      EXPENSE_CATEGORIES: EXP_CATS,
      _fxRateCache: rates,
      activeBook: 'bk1',
      isAuthor: () => author,
      getBook: () => book,
      getState: () => bookState,
      getBookCurrencyCode: (b) => b.currency,
      today: () => '2026-08-14',
      fmt: (n, c) => `${c} ${Number(n).toFixed(2)}`,
      showToast: (msg, type) => toasts.push({ msg, type }),
      addLog: (_id, msg) => logs.push(msg),
      confirmDialog: async () => confirmAnswer,
      reportClientError: () => {},
      console: { error: () => {}, warn: () => {} },

      // ── persistence & network
      saveTaxCenter: async () => { saved.taxCenter++; },
      saveState: async () => { saved.state++; },
      saveReceiptBestEffort: saveReceipt,
      uploadReceiptToCloud: uploadCloud,
      notifyPublisherSubmission: async (kind, data, summary) => notified.push({ kind, data, summary }),
      fetchLiveRate: async (from, to) => {
        fxFetches.push(`${from}_${to}`);
        return { rate: rates[`${from}_${to}`] || 0 };
      },
      _findDuplicateExpense: (draft) => (taxCenter.businessExpenses || []).find(e =>
        e.date === draft.date &&
        Number(e.amount).toFixed(2) === Number(draft.amount).toFixed(2) &&
        (e.currency || 'CAD').toUpperCase() === String(draft.currency || 'CAD').toUpperCase()
      ) || null,
      _extractReceiptFromFile: extract || (async () => ({})),

      // ── scan-result coercion, mirroring the real helpers
      _parseReceiptAmount: (v) => {
        if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
        const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(n) ? n : 0;
      },
      normalizeReceiptDate: (s) => {
        if (!s) return '';
        const t = String(s).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
        const d = new Date(t);
        if (isNaN(d.getTime())) return '';
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      },
      inferReceiptCategory: (vendor) => (/air|hotel|train/i.test(vendor || '') ? 'Travel & Meals' : 'Other'),
      AbortController, DOMException
    },
    moduleState: `
      let _batchExpenseRows = [];
      let _batchExpenseDest = 'business';
      let _batchExpenseUid = 0;
      let _batchScanAbort = null;
      let _batchExpenseBusy = false;
    `,
    returns: `({
      newRow: _batchExpenseNewRow,
      describe: _batchExpenseDescription,
      duplicate: _batchExpenseDuplicate,
      categories: _batchExpenseCategories,
      defaultCurrency: _batchExpenseDefaultCurrency,
      currencies: _batchExpenseCurrencies,
      destinations: batchExpenseDestinations,
      applyScan: _applyBatchScanResult,
      deselectDuplicates: deselectDuplicateBatchExpenses,
      toggleAll: toggleAllBatchExpenses,
      scanAll: scanAllBatchExpenses,
      submit: submitBatchExpenses,
      postBusiness: _postBatchToBusinessLedger,
      postProject: _postBatchToProjectLedger,
      warmRates: _warmBatchExpenseRates,
      setDest: (d) => { _batchExpenseDest = d; },
      setRows: (r) => { _batchExpenseRows = r; },
      getRows: () => _batchExpenseRows,
      getDest: () => _batchExpenseDest
    })`
  });

  return { ...h, toasts, logs, saved, notified, fxFetches };
}

function emptyTaxCenter(extra = {}) {
  return { businessExpenses: [], recurring: [], settings: { baseCurrency: 'CAD', geminiKey: 'k-test' }, ...extra };
}

/** A staged row with sensible defaults, bypassing the DOM-bound constructor. */
function row(over = {}) {
  return {
    uid: over.uid || `bx${Math.random().toString(36).slice(2, 8)}`,
    file: null, fileName: '', include: true, status: 'manual', error: '', confidence: null,
    vendor: 'Staples', description: 'Padded envelopes', date: '2026-08-01',
    amount: '24.99', currency: 'CAD', category: 'Office Supplies', reference: '',
    ...over
  };
}

describe('batch expense — staging rules', () => {
  it('offers the business ledger to a publisher and the book ledger alongside it', () => {
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] } });
    expect(h.destinations().map(d => d.id)).toEqual(['business', 'project']);
  });

  it('never offers the business ledger to an author', () => {
    // saveTaxCenter() is a no-op for an author, so a batch posted there would
    // vanish without a word. The picker must not be able to name it at all.
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] }, author: true });
    expect(h.destinations().map(d => d.id)).toEqual(['project']);
  });

  it('offers the AI reader every category all three lists know about', () => {
    // The Tax Centre picker, TC_CATEGORIES and the scan schema have never
    // agreed. Offering only one of them drops a correctly-read category.
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] } });
    const cats = h.categories();
    expect(cats).toContain('Artist Royalties');       // TC_CATEGORIES only
    expect(cats).toContain('Sales Processing Fees');  // scan schema only
    expect(new Set(cats).size).toBe(cats.length);
  });

  it("always offers the book's own currency, even an unusual one", () => {
    // A dropdown with no option for the book's currency is not a missing
    // choice — the browser ignores the assignment and the row silently logs
    // in whatever currency happens to sit at the top of the list.
    const h = harness({
      taxCenter: emptyTaxCenter(),
      bookState: { expenses: [] },
      book: { title: 'Norrsken', currency: 'SEK' }
    });
    h.setDest('project');
    expect(h.currencies()).toContain('SEK');
    expect(h.defaultCurrency()).toBe('SEK');
  });

  it('joins vendor and description without repeating the vendor', () => {
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] } });
    expect(h.describe({ vendor: 'Lulu', description: 'Proof copies' })).toBe('Lulu — Proof copies');
    expect(h.describe({ vendor: 'Lulu', description: 'Lulu print run' })).toBe('Lulu print run');
    expect(h.describe({ vendor: '', description: 'Parking' })).toBe('Parking');
  });
});

describe('batch expense — duplicate flagging', () => {
  it('flags a row that matches an expense already in the ledger', () => {
    const h = harness({
      taxCenter: emptyTaxCenter({
        businessExpenses: [{ id: 1, date: '2026-08-01', amount: 24.99, currency: 'CAD', desc: 'Staples' }]
      }),
      bookState: { expenses: [] }
    });
    h.setRows([row()]);
    expect(h.duplicate(h.getRows()[0])).toBe('ledger');
  });

  it('flags only the later of two identical rows in the same pile', () => {
    // Dropping the same photo in twice is the common case. Lighting up both
    // rows makes one real pair read as two separate problems.
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] } });
    const rows = [row({ uid: 'a' }), row({ uid: 'b' })];
    h.setRows(rows);
    expect(h.duplicate(rows[0])).toBe('');
    expect(h.duplicate(rows[1])).toBe('batch');
  });

  it('stops flagging a twin once the other copy is deselected', () => {
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] } });
    const rows = [row({ uid: 'a', include: false }), row({ uid: 'b' })];
    h.setRows(rows);
    expect(h.duplicate(rows[1])).toBe('');
  });

  it('unticks every copy in a run of three, not just one', () => {
    // Deselecting as it walks would change what the rows after it compare
    // against, leaving the third copy selected and quietly double-logged.
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] } });
    const rows = [row({ uid: 'a' }), row({ uid: 'b' }), row({ uid: 'c' })];
    h.setRows(rows);
    h.deselectDuplicates();
    expect(rows.map(r => r.include)).toEqual([true, false, false]);
  });

  it('checks the book ledger, not the Tax Centre, for a project batch', () => {
    const h = harness({
      taxCenter: emptyTaxCenter(),
      bookState: { expenses: [{ id: 9, date: '2026-08-01', origAmount: 24.99, origCurrency: 'CAD', desc: 'Staples' }] }
    });
    h.setDest('project');
    h.setRows([row()]);
    expect(h.duplicate(h.getRows()[0])).toBe('ledger');
  });
});

describe('batch expense — applying a reading to a row', () => {
  let h;
  beforeEach(() => { h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] } }); });

  it('coerces a comma-grouped total and a human-readable date', () => {
    const r = row({ amount: '', date: '', vendor: '', description: '', category: '' });
    h.applyScan(r, { vendor: 'Ingram', date: 'Mar 4, 2026', amount: '1,234.56', currency: 'CAD' });
    expect(r.amount).toBe('1234.56');
    expect(r.date).toBe('2026-03-04');
    expect(r.status).toBe('scanned');
  });

  it('refuses a currency the batch cannot hold and says which one', () => {
    const r = row({ currency: 'CAD' });
    h.applyScan(r, { vendor: 'Loja', date: '2026-03-04', amount: 50, currency: 'BRL' });
    expect(r.currency).toBe('CAD');
    expect(r.error).toContain('BRL');
  });

  it('marks a reading that found nothing as failed, not as scanned-and-empty', () => {
    // "Scanned" with every field blank reads as "this receipt had no total",
    // which sends the owner looking at the receipt instead of the photo.
    const r = row({ amount: '', date: '', vendor: '', description: '' });
    h.applyScan(r, {});
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/sharper|type it in/i);
  });

  it('falls back to an inferred category when the reader names one it cannot use', () => {
    const r = row({ category: '' });
    h.applyScan(r, { vendor: 'Air Canada', date: '2026-03-04', amount: 340, currency: 'CAD', category: 'Flights' });
    expect(r.category).toBe('Travel & Meals');
  });
});

describe('batch expense — reading a pile', () => {
  it('keeps every good reading when one receipt in the pile fails', async () => {
    // The whole point of the batch is that thirteen good receipts are not held
    // hostage by the fourteenth.
    const h = harness({
      taxCenter: emptyTaxCenter(),
      bookState: { expenses: [] },
      extract: async (_key, f) => {
        if (f.name === 'bad.jpg') throw new Error('Gemini said no');
        return { vendor: 'Staples', date: '2026-08-02', amount: 12.5, currency: 'CAD' };
      }
    });
    const rows = [
      row({ uid: 'a', file: file('a.jpg'), fileName: 'a.jpg', status: 'ready', amount: '' }),
      row({ uid: 'b', file: file('bad.jpg'), fileName: 'bad.jpg', status: 'ready', amount: '' }),
      row({ uid: 'c', file: file('c.jpg'), fileName: 'c.jpg', status: 'ready', amount: '' })
    ];
    h.setRows(rows);
    await h.scanAll();

    expect(rows.map(r => r.status)).toEqual(['scanned', 'failed', 'scanned']);
    expect(rows[0].amount).toBe('12.50');
    expect(rows[2].amount).toBe('12.50');
    expect(rows[1].error).toContain('Gemini said no');
    expect(h.toasts.some(t => /Read 2 of 3/.test(t.msg))).toBe(true);
  });

  it('leaves already-read rows alone on a second run', async () => {
    const extract = vi.fn(async () => ({ vendor: 'Staples', date: '2026-08-02', amount: 5, currency: 'CAD' }));
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] }, extract });
    h.setRows([
      row({ uid: 'a', file: file('a.jpg'), status: 'scanned' }),
      row({ uid: 'b', file: file('b.jpg'), status: 'ready' })
    ]);
    await h.scanAll();
    expect(extract).toHaveBeenCalledTimes(1);
  });
});

describe('batch expense — posting to the business ledger', () => {
  it('gives every entry its own id even when the whole batch saves in one tick', async () => {
    // Every ledger action — edit, delete, attach a receipt, move category —
    // addresses a row by id. Two rows sharing one means editing either edits
    // whichever the lookup happens to find first.
    const tc = emptyTaxCenter();
    const h = harness({ taxCenter: tc, bookState: { expenses: [] } });
    const rows = [row({ uid: 'a' }), row({ uid: 'b' }), row({ uid: 'c' })];

    const out = await h.postBusiness(rows);

    expect(out.logged).toBe(3);
    const ids = tc.businessExpenses.map(e => e.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('lands the batch in the order it was staged, newest batch on top', async () => {
    const tc = emptyTaxCenter({ businessExpenses: [{ id: 0, desc: 'older', date: '2026-01-01', amount: 1, currency: 'CAD' }] });
    const h = harness({ taxCenter: tc, bookState: { expenses: [] } });
    await h.postBusiness([
      row({ vendor: 'First', description: '' }),
      row({ vendor: 'Second', description: '' }),
      row({ vendor: 'Third', description: '' })
    ]);
    expect(tc.businessExpenses.map(e => e.desc)).toEqual(['First', 'Second', 'Third', 'older']);
  });

  it('converts to the base currency once, using the warmed rate', async () => {
    const tc = emptyTaxCenter();
    const h = harness({ taxCenter: tc, bookState: { expenses: [] }, rates: { USD_CAD: 1.4 } });
    await h.postBusiness([row({ currency: 'USD', amount: '100' })]);

    const entry = tc.businessExpenses[0];
    expect(entry.currency).toBe('USD');
    expect(entry.amount).toBe(100);
    expect(entry.fxRate).toBe(1.4);
    expect(entry.baseAmount).toBeCloseTo(140, 5);
  });

  it('fetches each missing rate once for the whole batch, not once per row', async () => {
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] }, rates: {} });
    await h.postBusiness([
      row({ currency: 'USD', amount: '10' }),
      row({ currency: 'USD', amount: '20' }),
      row({ currency: 'EUR', amount: '30' })
    ]);
    expect(h.fxFetches).toEqual(['USD_CAD', 'EUR_CAD']);
  });

  it('applies the batch trip to every expense in it', async () => {
    const tc = emptyTaxCenter();
    const h = harness({ taxCenter: tc, bookState: { expenses: [] }, trip: 'Toronto Book Fair' });
    await h.postBusiness([row(), row()]);
    expect(tc.businessExpenses.every(e => e.trip === 'Toronto Book Fair')).toBe(true);
  });

  it('counts the receipts that could not be saved instead of losing them silently', async () => {
    // An expense with no receipt is the one an accountant disallows, so the
    // caller has to be able to tell the owner exactly how many need a file.
    const h = harness({
      taxCenter: emptyTaxCenter(),
      bookState: { expenses: [] },
      saveReceipt: async () => ({ ref: '', storage: 'none' })
    });
    const out = await h.postBusiness([
      row({ file: file() }),
      row({ file: file() }),
      row()  // typed in by hand — no receipt expected, must not be counted
    ]);
    expect(out.logged).toBe(3);
    expect(out.receiptsLost).toBe(2);
  });

  it('stamps a cloud-parked receipt so the Tax Centre can chase it home', async () => {
    const tc = emptyTaxCenter();
    const h = harness({
      taxCenter: tc,
      bookState: { expenses: [] },
      saveReceipt: async () => ({ ref: 'https://cloud/r.jpg', storage: 'cloud' })
    });
    await h.postBusiness([row({ file: file() })]);
    expect(tc.businessExpenses[0].receiptCloudAt).toBeTruthy();
  });
});

describe('batch expense — posting to a book ledger', () => {
  it('converts a foreign receipt into the book currency and records what was paid', async () => {
    const state = { expenses: [] };
    const h = harness({
      taxCenter: emptyTaxCenter(),
      bookState: state,
      book: { title: 'Bramble & Bee', currency: 'CAD' },
      rates: { USD_CAD: 1.4 }
    });
    await h.postProject([row({ vendor: 'Ingram', description: '', currency: 'USD', amount: '100' })]);

    const e = state.expenses[0];
    expect(e.currency).toBe('CAD');
    expect(e.amount).toBeCloseTo(140, 5);
    expect(e.origAmount).toBe(100);
    expect(e.origCurrency).toBe('USD');
    expect(e.desc).toBe('Ingram (Paid USD 100.00)');
  });

  it('keeps the currency actually paid when no rate can be had', async () => {
    // Same choice the single-expense form makes: an unconverted amount stored
    // under the book's currency would be a wrong number in the ledger.
    const state = { expenses: [] };
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: state, rates: {} });
    await h.postProject([row({ currency: 'USD', amount: '100' })]);

    const e = state.expenses[0];
    expect(e.currency).toBe('USD');
    expect(e.amount).toBe(100);
    expect(e.desc).not.toContain('Paid');
  });

  it('saves the book ledger once for the whole batch', async () => {
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] } });
    await h.postProject([row(), row(), row()]);
    expect(h.saved.state).toBe(1);
  });

  it('submits an author batch for approval and alerts the publisher once', async () => {
    // One email per receipt is how a batch of fourteen becomes fourteen
    // ignored notifications.
    const sent = [];
    window._fbSubmitActivity = async (_book, _kind, entry) => { sent.push(entry); };
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] }, author: true });

    const out = await h.postProject([row(), row(), row()]);

    expect(out.logged).toBe(3);
    expect(out.pending).toBe(true);
    expect(sent).toHaveLength(3);
    expect(h.notified).toHaveLength(1);
    expect(h.notified[0].summary).toContain('3 expenses');
  });

  it('reports the rows an author submission dropped without losing the rest', async () => {
    let n = 0;
    window._fbSubmitActivity = async () => { if (++n === 2) throw new Error('permission denied'); };
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] }, author: true });

    const out = await h.postProject([row({ uid: 'a' }), row({ uid: 'b' }), row({ uid: 'c' })]);

    expect(out.logged).toBe(2);
    expect(out.failed).toBe(1);
    expect([...out.failedUids]).toEqual(['b']);
  });
});

describe('batch expense — submit guards', () => {
  it('refuses the batch and names the rows missing a description or amount', async () => {
    const tc = emptyTaxCenter();
    const h = harness({ taxCenter: tc, bookState: { expenses: [] } });
    h.setRows([row(), row({ amount: '' }), row({ vendor: '', description: '' })]);

    await h.submit();

    expect(tc.businessExpenses).toHaveLength(0);
    expect(h.toasts.some(t => /2 rows need/.test(t.msg))).toBe(true);
  });

  it('ignores deselected rows entirely', async () => {
    const tc = emptyTaxCenter();
    const h = harness({ taxCenter: tc, bookState: { expenses: [] } });
    h.setRows([row(), row({ amount: '', include: false })]);

    await h.submit();

    expect(tc.businessExpenses).toHaveLength(1);
  });

  it('asks before re-logging something already in the ledger, and stops if told to', async () => {
    const tc = emptyTaxCenter({
      businessExpenses: [{ id: 1, date: '2026-08-01', amount: 24.99, currency: 'CAD', desc: 'Staples' }]
    });
    const h = harness({ taxCenter: tc, bookState: { expenses: [] }, confirmAnswer: false });
    h.setRows([row()]);

    await h.submit();

    expect(tc.businessExpenses).toHaveLength(1);
  });

  it('keeps only the failed rows staged so a retry cannot double-post the rest', async () => {
    let n = 0;
    window._fbSubmitActivity = async () => { if (++n === 2) throw new Error('offline'); };
    const h = harness({ taxCenter: emptyTaxCenter(), bookState: { expenses: [] }, author: true });
    h.setDest('project');
    h.setRows([row({ uid: 'a' }), row({ uid: 'b' }), row({ uid: 'c' })]);

    await h.submit();

    expect(h.getRows().map(r => r.uid)).toEqual(['b']);
  });
});

// ── The sheet against the real markup.
//
// Everything above runs the batch logic with the rendering stubbed out. That
// leaves one whole class of failure uncovered: a renamed id or a mistyped data
// attribute, which breaks nothing at build time and nothing in a unit test —
// the modal simply opens empty, or an edited amount never reaches the row it
// came from. So this suite mounts index.html itself and drives the real DOM.
function domHarness() {
  document.documentElement.innerHTML = INDEX_HTML;
  return buildHarness({
    names: [
      'BATCH_EXPENSE_CURRENCIES', 'BATCH_STATUS_LABEL', '_batchExpenseCurrencies',
      'batchExpenseDestinations', '_batchExpenseDefaultCurrency', '_batchExpenseCategories',
      '_batchExpenseNewRow', '_batchExpenseRow', '_batchExpenseDescription',
      '_batchExpenseDuplicate', '_batchExpenseStatusCell', 'renderBatchExpenseRows',
      'renderBatchExpenseModal', '_repaintBatchExpenseStatuses', '_paintBatchExpenseRow',
      '_updateBatchExpenseSummary', '_batchExpenseProgress', 'setBatchExpenseDest',
      'batchExpenseAddBlankRow', 'removeBatchExpenseRow', 'toggleAllBatchExpenses',
      'applyBatchExpenseBulk'
    ],
    deps: {
      $: (id) => document.getElementById(id),
      document,
      escapeHtml: (s) => String(s ?? '').replace(/[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      localStorage: { getItem: () => null, setItem: () => {} },
      TAX_CENTER: {
        businessExpenses: [{ trip: 'Toronto Fair', date: '2026-01-01', amount: 1, currency: 'CAD' }],
        settings: { baseCurrency: 'CAD', geminiKey: 'k-test' }
      },
      TC_CATEGORIES: TC_CATS,
      EXPENSE_CATEGORIES: EXP_CATS,
      isAuthor: () => false,
      activeBook: 'bk1',
      getBook: () => ({ title: 'Bramble & Bee', currency: 'CAD' }),
      getState: () => ({ expenses: [] }),
      getBookCurrencyCode: (b) => b.currency,
      today: () => '2026-08-14',
      fmt: (n, c) => `${c}${Number(n).toFixed(2)}`,
      showToast: () => {},
      _findDuplicateExpense: () => null,
      rescanBatchExpenseRow: () => {},
      normalizeReceiptDate: (s) => s,
      Event
    },
    moduleState: `
      let _batchExpenseRows = [];
      let _batchExpenseDest = 'business';
      let _batchExpenseUid = 0;
      let _batchScanAbort = null;
      let _batchExpenseBusy = false;
    `,
    returns: `({
      renderModal: renderBatchExpenseModal,
      addBlank: batchExpenseAddBlankRow,
      setDest: setBatchExpenseDest,
      toggleAll: toggleAllBatchExpenses,
      applyBulk: applyBatchExpenseBulk,
      remove: removeBatchExpenseRow,
      progress: _batchExpenseProgress,
      getRows: () => _batchExpenseRows
    })`
  });
}

describe('batch expense — the sheet against index.html', () => {
  let a;
  beforeEach(() => { a = domHarness(); a.renderModal(); });

  it('offers both ledgers and pre-fills the trip suggestions', () => {
    expect(document.querySelectorAll('#bx-dest .bx-dest-btn')).toHaveLength(2);
    expect(document.getElementById('bx-trip-options').innerHTML).toContain('Toronto Fair');
    expect(document.getElementById('bx-bulk-cat').innerHTML).toContain('Sales Processing Fees');
    expect(document.getElementById('bx-rows').textContent).toMatch(/Nothing staged/);
  });

  it('writes an edited amount back to the row it was typed into', () => {
    a.addBlank();
    const amount = document.querySelector('[data-bx-field="amount"]');
    amount.value = '12.50';
    amount.dispatchEvent(new Event('change', { bubbles: true }));

    expect(a.getRows()[0].amount).toBe('12.50');
    expect(document.getElementById('bx-summary').textContent).toContain('12.50');
    expect(document.getElementById('bx-submit-btn').textContent).toBe('Log 1 expense');
  });

  it('applies a bulk category to the rows and to what is on screen', () => {
    a.addBlank();
    document.getElementById('bx-bulk-cat').value = 'Travel & Meals';
    a.applyBulk('category');

    expect(a.getRows()[0].category).toBe('Travel & Meals');
    expect(document.querySelector('[data-bx-field="category"]').value).toBe('Travel & Meals');
  });

  it('cannot be submitted with nothing ticked', () => {
    a.addBlank();
    a.toggleAll(false);
    expect(document.getElementById('bx-summary').textContent).toBe('Nothing selected');
    expect(document.getElementById('bx-submit-btn').disabled).toBe(true);
  });

  it('swaps the category list and hides the trip field for a book batch', () => {
    // Trips are a Tax Centre idea; leaving the field on screen for a project
    // batch would collect something the book ledger has nowhere to put.
    a.setDest('project');
    expect(document.getElementById('bx-bulk-cat').innerHTML).not.toContain('Artist Royalties');
    expect(document.getElementById('bx-trip-wrap').style.display).toBe('none');
  });

  it('shows how far through a run it is', () => {
    a.progress(2, 4, 'Read');
    expect(document.getElementById('bx-progress-text').textContent).toBe('Read 2 of 4');
    expect(document.getElementById('bx-progress-bar').style.width).toBe('50%');
    a.progress(0, 0, '');
    expect(document.getElementById('bx-progress').style.display).toBe('none');
  });

  it('drops a removed row out of the table', () => {
    a.addBlank();
    a.addBlank();
    a.remove(a.getRows()[0].uid);
    expect(document.querySelectorAll('#bx-rows tbody tr')).toHaveLength(1);
  });
});
