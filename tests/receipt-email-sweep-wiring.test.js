// The receipt inbox scanning itself: the sweep's gates, its refusal to file
// anything unwatched, its health reporting, and the shared review table it
// shares safely with the Gmail add-on's own live feed.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appSource, buildHarness } from './helpers/extract-decl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

describe('the receipt sweep never files anything, it only drafts', () => {
  const sweep = appSource.slice(
    appSource.indexOf('async function sweepReceiptEmails'),
    appSource.indexOf('function startReceiptEmailSweep'),
  );

  it('is a real, non-empty slice of the sweep', () => {
    // Guards every not.toContain assertion below from passing vacuously if a
    // future refactor moves sweepReceiptEmails or renames its neighbour.
    expect(sweep.length).toBeGreaterThan(500);
  });

  it('never writes to the ledger', () => {
    // The whole point of the scope the owner chose: it scans itself, but
    // every find still waits in the review table for a deliberate import.
    expect(sweep).not.toContain('businessExpenses.unshift');
    expect(sweep).not.toContain('TAX_CENTER.businessExpenses.push');
  });

  it('never calls saveTaxCenter — a poll that files nothing must not touch the whole document', () => {
    // saveTaxCenter() serialises the entire tax document. A background poll
    // calling it is the defect class this app has already shipped once
    // (#745) and caught a second time in the Stripe fee sweep; this is the
    // test that stops it becoming a third.
    expect(sweep).not.toContain('saveTaxCenter');
  });

  it('runs the same extraction pipeline the manual Extract button runs', () => {
    expect(sweep).toContain('_callAiForReceipts(');
    expect(sweep).toContain('RECEIPT_EXTRACTION_SCHEMA');
    expect(sweep).toContain('_draftsFromReceiptRows(');
    expect(sweep).toContain('_buildReceiptPrompt()');
  });

  it('caps how much it will ask Gemini to read in one run', () => {
    expect(sweep).toContain('RECEIPT_SWEEP_EXTRACT_CAP');
    expect(sweep).toContain('EMAIL_EXTRACT_CONCURRENCY');
  });

  it('marks every found row as auto-sourced, not a hand-driven find', () => {
    expect(sweep).toContain('_fromSweep: true');
  });
});

describe('the receipt sweep is gated like every other background watch', () => {
  function sweepHarness({
    online = true, visible = true, configured = true, dueOverride = null,
  } = {}) {
    const calls = { noteSuccess: [], noteFailure: [], fetch: [] };
    const harness = buildHarness({
      names: ['sweepReceiptEmails'],
      deps: {
        TAX_CENTER: { settings: configured ? { geminiKey: 'k' } : {}, businessExpenses: [] },
        sheetsUrl: configured ? 'https://script.example/exec' : '',
        browserWatchState: () => ({ online, visible }),
        dueForCheck: (opts) => (dueOverride !== null ? dueOverride : (opts.online && opts.configured && opts.visible && !opts.busy)),
        effectiveInterval: (base) => base,
        integrationBackoffMs: () => 0,
        readReceiptSweepStamp: () => 0,
        readReceiptSweepPending: () => [],
        writeReceiptSweepStamp: () => {},
        writeReceiptSweepPending: () => {},
        receiptSweepWindowStart: () => 0,
        _receiptSweepQuery: () => 'q',
        noteIntegrationSuccess: (id) => calls.noteSuccess.push(id),
        noteIntegrationFailure: (id, err) => calls.noteFailure.push({ id, err }),
        fetch: async () => { calls.fetch.push(1); return { ok: true, json: async () => ({ ok: true, emails: [] }) }; },
        $: () => null,
        mergeReceiptDrafts: (a) => a,
        updateEmailInboxBadge: () => {},
      },
      moduleState: `
        let _receiptSweeping = false;
        let _emailReceiptDrafts = [];
        const RECEIPT_SWEEP_INTERVAL_MS = 1800000;
        const RECEIPT_SWEEP_COLD_START_DAYS = 14;
        const RECEIPT_SWEEP_LIST_LIMIT = 25;
        const RECEIPT_SWEEP_EXTRACT_CAP = 8;
      `,
      returns: '{ sweepReceiptEmails }',
    });
    return { ...harness, calls };
  }

  it('does nothing when offline', async () => {
    const { sweepReceiptEmails, calls } = sweepHarness({ online: false });
    await sweepReceiptEmails();
    expect(calls.fetch).toEqual([]);
  });

  it('does nothing without a Gemini key or a connected inbox', async () => {
    const { sweepReceiptEmails, calls } = sweepHarness({ configured: false });
    await sweepReceiptEmails();
    expect(calls.fetch).toEqual([]);
  });

  it('does nothing while the app is backgrounded', async () => {
    const { sweepReceiptEmails, calls } = sweepHarness({ visible: false });
    await sweepReceiptEmails();
    expect(calls.fetch).toEqual([]);
  });

  it('runs when due', async () => {
    const { sweepReceiptEmails, calls } = sweepHarness({ dueOverride: true });
    await sweepReceiptEmails();
    expect(calls.fetch.length).toBe(1);
    expect(calls.noteSuccess).toEqual(['receipt-scan']);
  });

  it('reports failure under its own name rather than throwing', async () => {
    const harness = buildHarness({
      names: ['sweepReceiptEmails'],
      deps: {
        TAX_CENTER: { settings: { geminiKey: 'k' }, businessExpenses: [] },
        sheetsUrl: 'https://script.example/exec',
        browserWatchState: () => ({ online: true, visible: true }),
        dueForCheck: () => true,
        effectiveInterval: (b) => b,
        integrationBackoffMs: () => 0,
        readReceiptSweepStamp: () => 0,
        readReceiptSweepPending: () => [],
        writeReceiptSweepStamp: () => {},
        writeReceiptSweepPending: () => {},
        receiptSweepWindowStart: () => 0,
        _receiptSweepQuery: () => 'q',
        noteIntegrationSuccess: () => {},
        noteIntegrationFailure: (id, err) => { thrown.id = id; thrown.err = err; },
        fetch: async () => { throw new Error('network down'); },
        $: () => null,
        mergeReceiptDrafts: (a) => a,
        updateEmailInboxBadge: () => {},
      },
      moduleState: `
        let _receiptSweeping = false;
        let _emailReceiptDrafts = [];
        const RECEIPT_SWEEP_INTERVAL_MS = 1800000;
        const RECEIPT_SWEEP_COLD_START_DAYS = 14;
        const RECEIPT_SWEEP_LIST_LIMIT = 25;
        const RECEIPT_SWEEP_EXTRACT_CAP = 8;
      `,
      returns: '{ sweepReceiptEmails }',
    });
    const thrown = {};
    const result = await harness.sweepReceiptEmails();
    expect(result).toBeNull();
    expect(thrown.id).toBe('receipt-scan');
    expect(thrown.err).toBeInstanceOf(Error);
  });
});

describe('a receipt is never lost to a reload before it is reviewed', () => {
  const sweep = appSource.slice(
    appSource.indexOf('async function sweepReceiptEmails'),
    appSource.indexOf('function startReceiptEmailSweep'),
  );

  it('computes its search window through receiptSweepWindowStart, not a bare timestamp', () => {
    // This is what stops the search window from closing past a receipt that
    // was found and drafted but not yet imported — the drafts themselves live
    // only in memory, so this is the one thing standing between a reload and
    // losing one for good.
    expect(sweep).toContain('receiptSweepWindowStart({');
    expect(sweep).toContain('pendingFoundAts: pending.map(p => p.foundAt)');
  });

  it('persists what it found before it is resolved, so the window can reach back for it', () => {
    expect(sweep).toContain('writeReceiptSweepPending([...pending, ...newPendingEntries])');
  });

  it('overlaps by a day, the same reasoning as every other sweep', () => {
    const start = appSource.indexOf('function receiptSweepWindowStart');
    expect(start).toBeGreaterThan(0);
    // A tight window past the function's own opening line is enough to prove
    // the overlap constant is actually inside it, not just somewhere in the
    // file — the exact closing brace isn't needed for that.
    expect(appSource.slice(start, start + 800)).toContain('86400000');
  });
});

describe('the same receipt never drafts twice across two runs', () => {
  const sweep = appSource.slice(
    appSource.indexOf('async function sweepReceiptEmails'),
    appSource.indexOf('function startReceiptEmailSweep'),
  );

  it('excludes a message already imported or already sitting in the drafts table', () => {
    expect(sweep).toContain('importedMsgIds.has(id)');
    expect(sweep).toContain('alreadyDrafted.has(id)');
  });

  it('merges into the shared drafts array rather than replacing it', () => {
    expect(sweep).toContain('mergeReceiptDrafts(_emailReceiptDrafts, foundDrafts)');
  });
});

describe('sharing the drafts table with a hand-driven review and the Gmail add-on', () => {
  it('re-renders only when nobody is mid-review', () => {
    const sweep = appSource.slice(
      appSource.indexOf('async function sweepReceiptEmails'),
      appSource.indexOf('function startReceiptEmailSweep'),
    );
    expect(sweep).toContain('_emailDraftsHaveManualReview()');
  });

  it('defines manual review as a row from neither auto source', () => {
    const fn = appSource.slice(
      appSource.indexOf('function _emailDraftsHaveManualReview'),
      appSource.indexOf('function _emailDraftsHaveManualReview') + 300,
    );
    expect(fn).toContain('!d._inboxId && !d._fromSweep');
  });

  it('reopening the modal preserves auto-sourced rows and clears hand-entered ones', () => {
    const openFn = appSource.slice(
      appSource.indexOf('function openEmailReceiptImportModal'),
      appSource.indexOf('function closeEmailReceiptImportModal'),
    );
    expect(openFn).toContain('_emailReceiptDrafts.filter(d => d._inboxId || d._fromSweep)');
    // The old unconditional wipe must be gone, not merely supplemented.
    expect(openFn).not.toMatch(/_emailReceiptDrafts = \[\];/);
  });

  it('the Gmail add-on feed merges instead of replacing, and the old defer-banner is gone', () => {
    const loadFn = appSource.slice(
      appSource.indexOf('function loadGmailInboxDrafts'),
      appSource.indexOf('async function localizeInboxReceiptFiles'),
    );
    expect(loadFn).toContain('mergeReceiptDrafts(_emailReceiptDrafts, _emailInboxItems.map(_inboxItemToDraft))');
    expect(loadFn).not.toContain('hasUnsavedReview');
    expect(loadFn).not.toContain('replaces the drafts below');
  });
});

describe('a wrongly-flagged row can be made to go away for good', () => {
  it('dismissEmailReceiptDraft removes the row and its persisted trace', () => {
    const fn = appSource.slice(
      appSource.indexOf('function dismissEmailReceiptDraft'),
      appSource.indexOf('/** The card for a run that found something. */'),
    );
    expect(fn).toContain('_emailReceiptDrafts.splice(i, 1)');
    expect(fn).toContain('_clearResolvedSweepPending([draft])');
  });

  it('is only offered on a row an automated source found', () => {
    expect(appSource).toContain("(r._fromSweep || r._inboxId) ? `<button class=\"btn sm\" type=\"button\" title=\"Not a receipt");
  });
});

describe('health, boot, and the Check now button', () => {
  it('reports success and failure under its own integration id', () => {
    const sweep = appSource.slice(
      appSource.indexOf('async function sweepReceiptEmails'),
      appSource.indexOf('function startReceiptEmailSweep'),
    );
    expect(sweep).toContain("noteIntegrationSuccess('receipt-scan')");
    expect(sweep).toContain("noteIntegrationFailure('receipt-scan', error");
    expect(sweep).toContain("integrationBackoffMs('receipt-scan'");
  });

  it('is registered as its own integration, distinct from the Gmail transport it shares', () => {
    const watchSource = fs.readFileSync(path.resolve(__dirname, '../src/lib/integration-watch.js'), 'utf8');
    expect(watchSource).toContain("'receipt-scan': { id: 'receipt-scan', label: 'Receipt inbox scan' }");
  });

  it('runs through the shared scheduler, not its own timer', () => {
    const start = appSource.slice(
      appSource.indexOf('function startReceiptEmailSweep'),
      appSource.indexOf('// ── EXPENSE FORM & LEDGER'),
    );
    expect(start).toContain('startWatch(');
    expect(start).toContain('if (_receiptSweepStarted');
  });

  it('is started at boot and reachable from the Check now button', () => {
    expect(appSource).toContain('startReceiptEmailSweep();');
    expect(appSource).toContain("if (id === 'receipt-scan') return sweepReceiptEmails({ force: true });");
  });

  it('marks the Tax Centre tab for the receipt scan too', () => {
    expect(indexContent.match(/data-health-badge="shippo,canadapost,shipping-email,stripe-fees,receipt-scan"/g)).toHaveLength(2);
  });
});
