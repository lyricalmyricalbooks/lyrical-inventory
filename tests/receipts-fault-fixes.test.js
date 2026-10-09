import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildHarness, extractDecl } from './helpers/extract-decl.js';
import { roundCents } from '../src/lib/money.js';
import { datedCadRate } from '../src/lib/sale-fx.js';
import { totalsByCurrency } from '../src/lib/expense-totals.js';
import { uniqueZipPath } from '../src/lib/zip.js';
import { receiptDuplicate, receiptExpense } from '../src/lib/receipt-finder.js';
import { flushReceiptOutbox } from '../src/lib/receipt-finder-outbox.js';
import { toLocalRef } from '../src/lib/receipt-storage.js';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const receiptsSrc = read('src/features/receipts.js');
const taxSrc = read('src/features/taxcentre.js');

// ── Tax Centre ───────────────────────────────────────────────────────────

describe('trip totals value an expense the way the ledger does', () => {
  const make = (cache) => buildHarness({
    names: ['_tcExpenseBaseAmount'],
    deps: { datedCadRate, roundCents, _fxRateCache: cache },
    returns: '_tcExpenseBaseAmount',
  });

  it('uses the stored CAD value when there is one', () => {
    expect(make({})({ currency: 'USD', amount: 10, baseAmount: 13.5, date: '2026-03-01' })).toBe(13.5);
  });

  it('uses the rate for the expense date, not today\'s', () => {
    const f = make({ USD_CAD: 1.5, 'USD_CAD@2026-03-01': 1.3 });
    expect(f({ currency: 'USD', amount: 10, date: '2026-03-01' })).toBe(13);
  });

  it('counts an expense flagged as missing its rate as 0 rather than today\'s rate or 1:1', () => {
    const f = make({ USD_CAD: 1.5 });
    expect(f({ currency: 'USD', amount: 10, date: '2026-03-01', baseAmount: null, fxMissing: true })).toBe(0);
    expect(make({})({ currency: 'USD', amount: 10, date: '2026-03-01' })).toBe(0);
  });
});

describe('trip report applies the 50% meals limit', () => {
  it('tracks a deductible figure per trip and prints it as the deductible total', () => {
    expect(taxSrc).toContain('deductibleAmount(cat, eBase)');
    expect(taxSrc).toContain('const deductibleTotal = detail.byName[name].deductible ?? total;');
    expect(taxSrc).toContain('${fmt(deductibleTotal, baseCurrency)}</div>\n      <div class="label">Total deductible spend');
    expect(taxSrc).toContain('% limit)');
  });
});

describe('the missing-receipt audit ignores rows that can never have a receipt', () => {
  it('artist payout and exempt-flagged expense rows carry the exemption into the ledger', () => {
    const payout = taxSrc.slice(taxSrc.indexOf("sourceType: 'artistPayout',\n          sourceId: bid,\n          itemId: p.id"));
    expect(taxSrc).toMatch(/receiptExempt: true,\n\s+sourceType: 'artistPayout'/);
    expect(payout).toBeTruthy();
    expect(taxSrc).toContain('receiptExempt: !!(e.receiptExempt || e.isRent),');
  });
});

describe('recurring back-charges are not locked to today\'s rate', () => {
  it('flags a past charge that has no rate of its own date, so the rate healer fixes it', () => {
    expect(taxSrc).toContain("fxRate.estimated && !fxRate.missing && String(charge.date || '') < today()");
  });
});

// ── receipts.js ──────────────────────────────────────────────────────────

describe('bulk reimbursement never adds currencies together', () => {
  it('totals each currency on its own, book currency first', () => {
    const totals = totalsByCurrency([
      { amount: 20, currency: 'EUR' }, { amount: 30, currency: 'CAD' }, { amount: 10, currency: 'USD' }, { amount: 5, currency: 'CAD' },
    ], 'CAD');
    expect(totals).toEqual([
      { code: 'CAD', total: 35 }, { code: 'EUR', total: 20 }, { code: 'USD', total: 10 },
    ]);
  });
  it('is used for the request summary', () => {
    expect(receiptsSrc).toContain("totalsByCurrency(items, cur).map(t => fmt(t.total, t.code)).join(' + ')");
  });
});

describe('the receipts zip manifest names the file the zip really holds', () => {
  it('gives colliding names the same suffix createZip would', () => {
    const seen = new Set(['manifest.csv']);
    expect(uniqueZipPath('2026/Travel/a.jpg', seen)).toBe('2026/Travel/a.jpg');
    expect(uniqueZipPath('2026/Travel/a.jpg', seen)).toBe('2026/Travel/a-2.jpg');
    expect(uniqueZipPath('2026/Travel/A.jpg', seen)).toBe('2026/Travel/A-3.jpg');
  });
});

describe('reclaiming cloud receipts', () => {
  it('can download without deleting, leaving the delete to the caller', async () => {
    const deleted = [];
    const reclaim = buildHarness({
      names: ['reclaimOneReceipt'],
      deps: {
        fetch: async () => ({ ok: true, status: 200, blob: async () => ({ type: 'image/jpeg' }) }),
        File: class { constructor(parts, name) { this.name = name; } },
        saveReceiptToLocalFile: async () => 'General/x.jpg',
        toLocalRef,
        window: { _fbDeleteReceipt: async (u) => { deleted.push(u); } },
        console: { warn: () => {}, error: () => {} },
      },
      returns: 'reclaimOneReceipt',
    });
    const ref = await reclaim('https://cloud/o%2Fx.jpg?t=1', {}, null, { keepCloud: true });
    expect(ref).toBe('local://General/x.jpg');
    expect(deleted).toEqual([]);
  });

  it('saves each expense\'s new links before deleting its cloud copies, and rolls back on a failed save', () => {
    const loop = receiptsSrc.slice(receiptsSrc.indexOf('const cloudToDelete = [];'), receiptsSrc.indexOf("if (btn) { btn.disabled = false; btn.textContent = btnText; }\n\n  // Keep the last batch"));
    expect(loop.indexOf('saveTaxCenter()')).toBeGreaterThan(-1);
    expect(loop.indexOf('saveTaxCenter()')).toBeLessThan(loop.indexOf('_fbDeleteReceipt(url)'));
    expect(loop).toContain('if (!saved) {');
    expect(loop).toContain('exp.receipt = prevReceipt;');
  });
});

describe('batch re-link only matches the same file name', () => {
  it('no longer attaches a file just because its name contains the expense date', () => {
    const fn = receiptsSrc.slice(receiptsSrc.indexOf('async function batchScanAndRelinkReceipts'), receiptsSrc.indexOf('async function attachReceiptToExpenseRow'));
    expect(fn).not.toContain('f.name.includes(exp.date)');
    expect(fn).toContain('f.name.toLowerCase() === baseFilename.toLowerCase()');
  });
});

describe('Paste & Upload pairs a draft with its own file', () => {
  const ctxFor = (paths) => ({ gmailSavedByMsg: {}, savedReceiptPaths: paths, draftIdx: 0 });
  const save = () => buildHarness({
    names: ['_pastedDraftFileIndex', '_saveDraftReceiptFiles'],
    deps: {
      localizeInboxReceiptFiles: async () => [], saveReceiptToLocalFile: async () => null,
      _emailContentCache: {}, _emailBodyToReceiptFile: () => null, atob, File, console,
    },
    returns: '_saveDraftReceiptFiles',
  });

  it('keeps each draft on its own file when an earlier row was unticked', async () => {
    const f = save();
    // Three files, the first draft unticked: the 2nd and 3rd drafts (rowIndex 1, 2)
    // must get files 1 and 2 — not 0 and 1.
    expect(await f({ rowIndex: 1 }, ctxFor(['local://a', 'local://b', 'local://c']))).toEqual(['local://b']);
    expect(await f({ rowIndex: 2 }, ctxFor(['local://a', 'local://b', 'local://c']))).toEqual(['local://c']);
  });

  it('gives a draft no receipt, not its neighbour\'s, when its own file failed to save', async () => {
    const f = save();
    expect(await f({ rowIndex: 1 }, ctxFor(['local://a', '', 'local://c']))).toEqual([]);
  });

  it('lets drafts beyond the file list share the first file (one PDF, several receipts)', async () => {
    const f = save();
    expect(await f({ rowIndex: 3 }, ctxFor(['local://a']))).toEqual(['local://a']);
  });
});

describe('Gmail add-on receipts keep every staged file', () => {
  function localize({ saveImpl, deleted = [] }) {
    return buildHarness({
      names: ['localizeInboxReceiptFiles'],
      deps: {
        saveReceiptToLocalFile: saveImpl,
        fetch: async () => ({ ok: true, blob: async () => ({ type: 'application/pdf' }) }),
        File: class { constructor(parts, name) { this.name = name; } },
        window: { _fbDeleteReceipt: async (u) => { deleted.push(u); } },
      },
      returns: 'localizeInboxReceiptFiles',
    });
  }
  const urls = [
    'https://firebasestorage.googleapis.com/v0/b/x/o/receipts%2Femail-imports%2F1%2Finvoice.pdf?alt=media',
    'https://firebasestorage.googleapis.com/v0/b/x/o/receipts%2Femail-imports%2F1%2Femail.txt?alt=media',
  ];

  it('returns all of them and leaves the cloud copies for the caller to delete after saving', async () => {
    const deleted = [];
    let n = 0;
    const item = { receiptUrls: urls };
    const refs = await localize({ saveImpl: async () => `local://email-imports/f${++n}.pdf`, deleted })(item);
    expect(refs).toEqual(['local://email-imports/f1.pdf', 'local://email-imports/f2.pdf']);
    expect(item._cloudToDelete).toEqual(urls);
    expect(deleted).toEqual([]);
  });

  it('keeps the cloud link for any file that could not be saved locally', async () => {
    const item = { receiptUrls: urls };
    let n = 0;
    const refs = await localize({ saveImpl: async () => (++n === 1 ? 'local://email-imports/f1.pdf' : null) })(item);
    expect(refs).toEqual(['local://email-imports/f1.pdf', urls[1]]);
    expect(item._cloudToDelete).toEqual([urls[0]]);
  });

  it('only deletes the staging copies after the expenses are saved', () => {
    const fn = receiptsSrc.slice(receiptsSrc.indexOf('async function _fileReceiptDrafts'), receiptsSrc.indexOf('// ── The receipt inbox scans itself'));
    expect(fn.indexOf('const saved = (await saveTaxCenter()) !== false;')).toBeGreaterThan(-1);
    expect(fn.indexOf('const saved = (await saveTaxCenter()) !== false;')).toBeLessThan(fn.indexOf('_fbDeleteReceipt(url)'));
    expect(fn).toContain('const inboxIds = saved ?');
  });
});

describe('a hand-run extraction keeps the drafts already waiting', () => {
  it('keeps add-on and sweep rows, drops a fresh duplicate of one, and adds the new rows', () => {
    const set = buildHarness({
      names: ['_setManualDrafts'],
      deps: {},
      moduleState: `let _emailReceiptDrafts = [
        { ref: 'receipt-email:a', msgId: 'a', _fromSweep: true, amount: 12 },
        { ref: '', _inboxId: 'i1', amount: 5 },
        { ref: '', amount: 99 },
      ];`,
      returns: '({ set: _setManualDrafts, get: () => _emailReceiptDrafts })',
    });
    set.set([{ ref: 'receipt-email:a', msgId: 'a', amount: 1 }, { ref: '', amount: 7 }, { ref: 'receipt-email:b', msgId: 'b', amount: 3 }]);
    expect(set.get().map(d => d.amount)).toEqual([12, 5, 7, 3]);
  });
});

describe('the expense form never converts with another currency\'s rate', () => {
  it('drops the old rate before the lookup and ignores a lookup the owner has moved on from', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const h = buildHarness({
      names: ['onExpenseCurrencyChange'],
      deps: {
        $: (id) => (id === 'exp-cur' ? { value: h_cur.value } : null),
        getBook: () => ({}), getBookCurrencyCode: () => 'CAD',
        _fxRateCache: {},
        fetchLiveRate: async () => { await gate; return { rate: 1.1 }; },
        calcExpenseFx: () => {},
      },
      moduleState: "let _expenseFxRate = 1.35; let _expenseFxRateCur = 'USD'; let _expenseFxReq = 0;",
      returns: '({ run: onExpenseCurrencyChange, rate: () => _expenseFxRate, cur: () => _expenseFxRateCur })',
    });
    const h_cur = { value: 'EUR' };
    const pending = h.run();
    // Mid-lookup: the USD rate must already be gone.
    expect(h.rate()).toBeNull();
    release();
    await pending;
    expect(h.rate()).toBe(1.1);
    expect(h.cur()).toBe('EUR');
  });

  it('submit uses only a rate belonging to the selected currency, and never books a foreign amount 1:1', () => {
    expect(receiptsSrc).toContain('let expenseFxRate = (_expenseFxRateCur === cur) ? _expenseFxRate : null;');
    expect(receiptsSrc).toContain('const baseAmount = cadRate ? roundCents(amount * cadRate) : null;');
  });
});

describe('foreign receipts are converted at the expense date\'s rate', () => {
  it('email import and batch logging resolve the rate for each receipt\'s own date', () => {
    expect(receiptsSrc).toContain('await resolveExpenseRate(cur, date, baseCurUp)');
    expect(receiptsSrc).toContain('datedRates.get(rateKeyOf(currency, item.date || today()))');
    expect(receiptsSrc).toContain('await resolveExpenseRate(currency, row.date || today(), base)');
  });

  it('the Gmail finder asks for the invoice date\'s rate when it files', async () => {
    const rate = vi.fn(async () => 1.3);
    const draft = {
      id: 'd1', status: 'queued', account: 'a@x.com', messageId: 'm1', vendor: 'Acme', date: '2026-02-03',
      currency: 'USD', amount: 10, category: 'Other', attachmentIds: [], attachments: [], confidence: 1,
    };
    const state = { drafts: [draft], emails: { 'a@x.com:m1': { id: 'm1', account: 'a@x.com', fileParts: [] } } };
    await flushReceiptOutbox(state, {
      canSync: () => true, expenses: () => [], rate,
      files: async () => ['u'], commit: async (e) => ({ expense: e }), accept: () => {},
      save: async () => {}, render: () => {},
    });
    expect(rate).toHaveBeenCalledWith('USD', '2026-02-03');
  });
});

describe('the receipt sweep', () => {
  function sweepWith({ emails, worthReading = () => true, aiFails = new Set(), seenStart = {} }) {
    const calls = { success: 0, failure: [], covered: [], stamps: 0, seenWritten: null, ai: 0 };
    const h = buildHarness({
      names: ['sweepReceiptEmails'],
      deps: {
        TAX_CENTER: { settings: { geminiKey: 'k' }, businessExpenses: [] },
        sheetsUrl: 'https://script.example/exec',
        browserWatchState: () => ({ online: true, visible: true }),
        dueForCheck: () => true, effectiveInterval: (b) => b, integrationBackoffMs: () => 0,
        readReceiptSweepStamp: () => 0, readReceiptSweepCovered: () => 111,
        readReceiptSweepPending: () => [], writeReceiptSweepPending: () => {},
        writeReceiptSweepStamp: () => { calls.stamps++; },
        writeReceiptSweepCovered: (t) => calls.covered.push(t),
        readReceiptSweepSeen: () => ({ ...seenStart }),
        writeReceiptSweepSeen: (s) => { calls.seenWritten = s; },
        receiptSweepWindowStart: () => 50,
        _receiptSweepQuery: () => 'q',
        noteIntegrationSuccess: () => { calls.success++; },
        noteIntegrationFailure: (id, err) => calls.failure.push(err.message),
        fetch: async () => ({ ok: true, json: async () => ({ ok: true, emails: emails.map(id => ({ id })) }) }),
        fetchSheetsCapabilities: async () => ({}), _batchFetchEmailContents: async () => {},
        _buildReceiptPrompt: () => 'p',
        _fetchEmailContent: async (id) => { if (aiFails.has(id)) throw new Error('boom'); return { id, subject: 's', from: 'f', date: 'd', body: 'b' }; },
        receiptWorthReading: (e) => worthReading(e),
        _selectedFileParts: () => [], _hydrateSelectedAttachmentBytes: async () => {}, _shrinkInlineAttachment: async () => {},
        _trimEmailBodyForScan: (b) => b, _callAiForReceipts: async () => { calls.ai++; return { text: '{}' }; },
        _parseReceiptJson: () => ({ receipts: [] }), _draftsFromReceiptRows: () => ({ drafts: [] }),
        filterDismissedReceipts: (d) => d,
        _runExtractionPool: async (items, _l, worker) => {
          const out = [];
          for (const it of items) { try { out.push({ ok: true, value: await worker(it) }); } catch (e) { out.push({ ok: false, error: e }); } }
          return out;
        },
        EMAIL_EXTRACT_CONCURRENCY: 2, RECEIPT_EXTRACTION_SCHEMA: {}, GEMINI_THINKING_SORT: 0,
        mergeReceiptDrafts: (a) => a, writePersistedEmailReceiptDrafts: () => {},
        _emailImportTabVisible: () => false, _emailDraftsHaveManualReview: () => false,
        updateEmailInboxBadge: () => {}, _showReceiptSweepAlert: () => {},
        console: { warn: () => {} },
      },
      moduleState: `
        let _receiptSweeping = false; let _emailReceiptDrafts = [];
        const RECEIPT_SWEEP_INTERVAL_MS = 1800000; const RECEIPT_SWEEP_COLD_START_DAYS = 14;
        const RECEIPT_SWEEP_LIST_LIMIT = 25; const RECEIPT_SWEEP_EXTRACT_CAP = 2;
      `,
      returns: '{ sweepReceiptEmails }',
    });
    return { ...h, calls };
  }

  it('remembers emails it has read (even ones that held no receipt) and skips them next time', async () => {
    const t = sweepWith({ emails: ['a', 'b'] });
    await t.sweepReceiptEmails();
    expect(Object.keys(t.calls.seenWritten).sort()).toEqual(['a', 'b']);
    const again = sweepWith({ emails: ['a', 'b', 'c'], seenStart: { a: 1, b: 1 } });
    await again.sweepReceiptEmails();
    expect(Object.keys(again.calls.seenWritten).sort()).toEqual(['a', 'b', 'c']);
  });

  it('does not spend an AI read on an email that cannot hold a receipt', async () => {
    const t = sweepWith({ emails: ['a'], worthReading: () => false });
    await t.sweepReceiptEmails();
    expect(t.calls.ai).toBe(0);
    expect(Object.keys(t.calls.seenWritten)).toEqual(['a']);
  });

  it('keeps its search window where it was when emails were capped out or unreadable', async () => {
    const capped = sweepWith({ emails: ['a', 'b', 'c'] }); // cap is 2 in this harness
    await capped.sweepReceiptEmails();
    expect(capped.calls.covered).toEqual([111]);

    const failed = sweepWith({ emails: ['a'], aiFails: new Set(['a']) });
    await failed.sweepReceiptEmails();
    expect(failed.calls.covered).toEqual([111]);
    expect(failed.calls.failure).toEqual(['1 receipt email could not be read']);
    expect(failed.calls.success).toBe(0);
    expect(Object.keys(failed.calls.seenWritten)).toEqual([]);
  });

  it('moves its window forward when everything was handled', async () => {
    const ok = sweepWith({ emails: ['a'] });
    await ok.sweepReceiptEmails();
    expect(ok.calls.covered.length).toBe(1);
    expect(ok.calls.covered[0]).toBeGreaterThan(111);
    expect(ok.calls.success).toBe(1);
  });
});

describe('the camera and the tidy-up folder pick', () => {
  it('stops a camera stream that arrives after the dialog was closed', () => {
    expect(receiptsSrc).toContain('_receiptCamReq++; // cancels a request still waiting on the permission prompt');
    expect(receiptsSrc).toContain("if (req !== _receiptCamReq) {");
    expect(receiptsSrc).toContain('stream.getTracks().forEach(t => t.stop());');
  });
  it('compares the two folders with isSameEntry', () => {
    expect(receiptsSrc).toContain('await _organizerDest.isSameEntry(_organizerSource)');
  });
});

// ── Gmail finder + add-on ────────────────────────────────────────────────

describe('a second identical receipt from a different email is not silently dropped', () => {
  const draft = {
    id: 'new', account: 'a@x.com', messageId: 'm2', vendor: 'Canada Post', date: '2026-05-01',
    currency: 'CAD', amount: 9.5, reference: '', attachmentIds: [],
  };
  const filed = (over = {}) => ({
    id: 'old', vendor: 'Canada Post', date: '2026-05-01', currency: 'CAD', amount: 9.5,
    emailMsgId: 'm1', emailAccount: 'a@x.com', ref: '', ...over,
  });

  it('files it when the matching expense came from another email and neither has an invoice number', () => {
    expect(receiptDuplicate(draft, [filed()])).toBeNull();
  });
  it('still flags the same email, a matching invoice number, or a hand-entered expense', () => {
    expect(receiptDuplicate(draft, [filed({ emailMsgId: 'm2' })])).not.toBeNull();
    expect(receiptDuplicate({ ...draft, reference: 'INV-1' }, [filed({ ref: 'INV-1' })])).not.toBeNull();
    expect(receiptDuplicate(draft, [filed({ emailMsgId: '', emailAccount: '' })])).not.toBeNull();
  });
});

describe('an oversized attachment no longer blocks filing', () => {
  it('receiptExpense keeps the slots of the other files and drops the empty one', () => {
    const draft = {
      id: 'd', vendor: 'V', date: '2026-01-01', currency: 'CAD', amount: 5, category: 'Other', description: 'x',
      account: 'a@x.com', messageId: 'm', attachmentIds: ['p1', 'p2'],
      attachments: [{ name: 'big.pdf' }, { name: 'ok.pdf' }],
    };
    const e = receiptExpense(draft, 1, ['u-body', '', 'u-ok']);
    expect(e.receiptFiles).toEqual(['u-body', 'u-ok']);
    expect(e.emailAttachments.map(a => a.downloadUrl)).toEqual(['', 'u-ok']);
  });
  it('the files step skips an attachment with no bytes instead of throwing', () => {
    const src = read('src/features/receipt-finder.js');
    expect(src).not.toContain('Original attachment missing');
    expect(src).toContain("if (entry.skipped) { output.push(''); continue; }");
  });
});

describe('the Gmail add-on does not guess a bare $ is USD', () => {
  const gs = read('apps-script/GmailAddon.gs');
  it('leaves the currency blank unless the email says which one', () => {
    expect(gs).not.toContain("currency = 'USD'");
    expect(gs).toContain("var currency = '';");
  });
  it('makes the owner name the currency before sending', () => {
    expect(gs).toContain('Enter the currency');
    expect(gs).not.toContain("f.currency || 'CAD'");
  });
});

describe('sanity', () => {
  it('extractDecl still finds the helpers', () => {
    expect(extractDecl('_pastedDraftFileIndex')).toContain('rowIndex');
  });
});
