import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appSource, buildHarness } from './helpers/extract-decl.js';
import {
  cloudPendingSince,
  cloudReceiptRefs,
  externalLinkRefs,
  hasOnlyExternalLinks,
  isExternalLink,
  isOurCloudReceipt,
  daysWaiting,
  hasCloudReceipt,
  isCloudReceipt,
  isLocalReceipt,
  localRefPath,
  receiptOwners,
  receiptRefsOf,
  summarizeReceiptStorage,
  toLocalRef,
  uniqueFileName,
  writeReceiptRefs,
  isRentExpense,
  isGratuityExpense,
  isReceiptExemptExpense,
} from '../src/lib/receipt-storage.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');

describe('receipt reference shapes', () => {
  it('tells a cloud reference from a filed one', () => {
    expect(isCloudReceipt('https://firebasestorage.googleapis.com/x.jpg')).toBe(true);
    expect(isCloudReceipt('http://example.com/x.jpg')).toBe(true);
    expect(isCloudReceipt('local://General/2026-08-12_x.jpg')).toBe(false);
    expect(isCloudReceipt('')).toBe(false);
    expect(isCloudReceipt(undefined)).toBe(false);

    expect(isLocalReceipt('local://General/x.jpg')).toBe(true);
    expect(isLocalReceipt('https://example.com/x.jpg')).toBe(false);
  });

  it('reads both the array and the legacy single-string shape', () => {
    expect(receiptRefsOf({ receiptFiles: ['a', 'b'], receipt: 'a' })).toEqual(['a', 'b']);
    expect(receiptRefsOf({ receipt: 'only.jpg' })).toEqual(['only.jpg']);
    expect(receiptRefsOf({ receiptFiles: [], receipt: 'legacy.jpg' })).toEqual(['legacy.jpg']);
    expect(receiptRefsOf({})).toEqual([]);
    expect(receiptRefsOf(null)).toEqual([]);
  });

  it('drops empty entries rather than counting them as receipts', () => {
    expect(receiptRefsOf({ receiptFiles: ['a', '', null, 'b'] })).toEqual(['a', 'b']);
  });

  it('keeps both shapes in step when writing back', () => {
    const exp = { receipt: 'old.jpg', receiptFiles: ['old.jpg'] };
    writeReceiptRefs(exp, ['local://General/new.jpg', 'https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg']);
    expect(exp.receiptFiles).toEqual(['local://General/new.jpg', 'https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg']);
    // Screens that still read the single field must not see a stale receipt.
    expect(exp.receipt).toBe('local://General/new.jpg');

    writeReceiptRefs(exp, []);
    expect(exp.receipt).toBe('');
    expect(exp.receiptFiles).toEqual([]);
  });

  it('always produces a prefixed local reference', () => {
    // A bare path renders as a dead web link in the ledger — the file is on
    // disk but nothing can open it.
    expect(toLocalRef('General/2026-08-12_x.jpg')).toBe('local://General/2026-08-12_x.jpg');
    expect(toLocalRef('local://General/x.jpg')).toBe('local://General/x.jpg');
    expect(toLocalRef('/General/x.jpg')).toBe('local://General/x.jpg');
    expect(toLocalRef('')).toBe('');
    expect(localRefPath('local://General/x.jpg')).toBe('General/x.jpg');
  });

  it('picks out only the cloud-held references', () => {
    const exp = { receiptFiles: ['local://a.jpg', 'https://firebasestorage.googleapis.com/v0/b/x/o/b.jpg', 'https://firebasestorage.googleapis.com/v0/b/x/o/c.jpg'] };
    expect(cloudReceiptRefs(exp)).toEqual(['https://firebasestorage.googleapis.com/v0/b/x/o/b.jpg', 'https://firebasestorage.googleapis.com/v0/b/x/o/c.jpg']);
    expect(hasCloudReceipt(exp)).toBe(true);
    expect(hasCloudReceipt({ receiptFiles: ['local://a.jpg'] })).toBe(false);
  });
});

describe('how long a receipt has been waiting in the cloud', () => {
  const now = new Date('2026-08-12T12:00:00Z');

  it('counts from the stamp written when the fallback happened', () => {
    const exp = { receipt: 'https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg', receiptCloudAt: '2026-08-01T12:00:00Z' };
    expect(daysWaiting(exp, now)).toBe(11);
  });

  it('falls back to the expense date for receipts that predate the stamp', () => {
    const exp = { receipt: 'https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg', date: '2026-07-29' };
    expect(cloudPendingSince(exp)).toBeInstanceOf(Date);
    expect(daysWaiting(exp, now)).toBe(14);
  });

  it('reports nothing for a receipt already filed locally', () => {
    expect(daysWaiting({ receipt: 'local://x.jpg', receiptCloudAt: '2020-01-01' }, now)).toBe(0);
    expect(cloudPendingSince({ receipt: 'local://x.jpg' })).toBeNull();
  });

  it('survives an unparseable date instead of reporting a nonsense age', () => {
    expect(daysWaiting({ receipt: 'https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg', receiptCloudAt: 'not a date' }, now)).toBe(0);
    expect(daysWaiting({ receipt: 'https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg' }, now)).toBe(0);
  });
});

describe('our stored files versus links to other websites', () => {
  // The real failure this encodes: 40 Shippo shipping labels were counted as
  // "receipts waiting in the cloud", and every attempt to move them failed with
  // `TypeError: Failed to fetch`. They were never in our storage — they are
  // links to Shippo's servers, and a browser cannot read another site's files.
  const SHIPPO = 'https://shippo-delivery-east.s3.amazonaws.com/abc123.pdf';
  const OURS = 'https://firebasestorage.googleapis.com/v0/b/x/o/receipts%2Fa.jpg?alt=media&token=t';

  it('recognises a file in our own storage', () => {
    expect(isOurCloudReceipt(OURS)).toBe(true);
    expect(isExternalLink(OURS)).toBe(false);
  });

  it('recognises a Shippo label as somebody else\'s file', () => {
    expect(isExternalLink(SHIPPO)).toBe(true);
    expect(isOurCloudReceipt(SHIPPO)).toBe(false);
  });

  it('treats a local file as neither', () => {
    expect(isOurCloudReceipt('local://a.jpg')).toBe(false);
    expect(isExternalLink('local://a.jpg')).toBe(false);
  });

  it('never offers an external link to the mover', () => {
    // This is the fix. cloudReceiptRefs drives the reclaim, so a label appearing
    // here is what made 40 receipts fail identically and for ever.
    const exp = { receiptFiles: [OURS, SHIPPO] };
    expect(cloudReceiptRefs(exp)).toEqual([OURS]);
    expect(externalLinkRefs(exp)).toEqual([SHIPPO]);
  });

  it('flags an expense whose only proof is a link to a label', () => {
    // A shipping label proves a parcel was sent, not that it was paid for.
    expect(hasOnlyExternalLinks({ receipt: SHIPPO })).toBe(true);
    expect(hasOnlyExternalLinks({ receiptFiles: [SHIPPO, OURS] })).toBe(false);
    expect(hasOnlyExternalLinks({ receipt: 'local://a.jpg' })).toBe(false);
    expect(hasOnlyExternalLinks({})).toBe(false);
  });
});

describe('receipt storage summary', () => {
  // Reframed from the old "backlog" summary. Receipts held in the cloud are the
  // permanent, healthy state now, so nothing here counts them as overdue — the
  // only number worth flagging is an expense with no receipt at all.
  const OURS = 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media';

  it('counts cloud and local files separately', () => {
    const items = [
      { receiptFiles: [OURS, `${OURS}&b=1`] },
      { receipt: OURS },
      { receipt: 'local://filed.jpg' },
      { receipt: '' },
    ];
    const s = summarizeReceiptStorage(items);
    expect(s.cloudExpenses).toBe(2);
    expect(s.cloudFiles).toBe(3);
    expect(s.localFiles).toBe(1);
    expect(s.totalFiles).toBe(4);
  });

  it('counts links separately and does not call them files we hold', () => {
    const s = summarizeReceiptStorage([
      { receipt: 'https://shippo-delivery-east.s3.amazonaws.com/label.pdf' },
      { receipt: OURS },
    ]);
    expect(s.linkedFiles).toBe(1);
    expect(s.linkOnlyExpenses).toBe(1);
    // A link is not a file in our possession.
    expect(s.totalFiles).toBe(1);
  });

  it('counts expenses that have no receipt at all — the actionable number', () => {
    const s = summarizeReceiptStorage([
      { receipt: 'https://cloud/a.jpg' },
      { receipt: '' },
      {},
    ]);
    expect(s.withReceipts).toBe(1);
    expect(s.withoutReceipts).toBe(2);
  });

  it('exempts rent and lease payments from the withoutReceipts missing count', () => {
    const items = [
      { desc: 'Monthly Studio Rent', cat: 'Home Office', receipt: '' },
      { desc: 'Office Lease Payment', cat: 'Rent', receipt: '' },
      { desc: 'Packaging boxes', cat: 'Packaging Materials', receipt: '' },
      { desc: 'Adobe Creative Cloud', cat: 'Software & Subscriptions', receipt: 'https://cloud/adobe.pdf' },
    ];
    const s = summarizeReceiptStorage(items);
    expect(s.withReceipts).toBe(1);
    expect(s.rentExpenses).toBe(2);
    expect(s.withoutReceipts).toBe(1); // only Packaging boxes is counted as withoutReceipts
  });

  it('identifies rent expenses accurately via isRentExpense helper', () => {
    expect(isRentExpense({ cat: 'Rent' })).toBe(true);
    expect(isRentExpense({ cat: 'Studio Rent' })).toBe(true);
    expect(isRentExpense({ desc: 'Studio rent for September' })).toBe(true);
    expect(isRentExpense({ desc: 'Monthly office lease' })).toBe(true);
    expect(isRentExpense({ desc: 'Landlord e-transfer' })).toBe(true);
    expect(isRentExpense({ isRent: true })).toBe(true);
    expect(isRentExpense({ receiptExempt: true })).toBe(true);
    expect(isRentExpense({ desc: 'Coffee beans', cat: 'Office Supplies' })).toBe(false);
    expect(isRentExpense(null)).toBe(false);
  });

  it('identifies gratuity expenses and receipt-exempt expenses accurately', () => {
    expect(isGratuityExpense({ gratuity: true })).toBe(true);
    expect(isGratuityExpense({ ref: 'GRAT-143338' })).toBe(true);
    expect(isGratuityExpense({ desc: 'Gratuity: Camilla Marraccini' })).toBe(true);
    expect(isGratuityExpense({ desc: 'Standard Office Supplies' })).toBe(false);
    expect(isGratuityExpense(null)).toBe(false);

    expect(isReceiptExemptExpense({ gratuity: true })).toBe(true);
    expect(isReceiptExemptExpense({ cat: 'Rent' })).toBe(true);
    expect(isReceiptExemptExpense({ desc: 'Printing 500 copies' })).toBe(false);
  });

  it('exempts gratuity copies from withoutReceipts in summarizeReceiptStorage', () => {
    const items = [
      { desc: 'Gratuity: Harley', ref: 'GRAT-143338', gratuity: true, receipt: '' },
      { desc: 'Marketing flyers', cat: 'Marketing', receipt: '' },
    ];
    const s = summarizeReceiptStorage(items);
    expect(s.withoutReceipts).toBe(1); // only Marketing flyers
  });

  it('never reports an age or an overdue count', () => {
    // The old summary drove a "95 days waiting" nag about a healthy state.
    const s = summarizeReceiptStorage([{ receipt: 'https://cloud/a.jpg', receiptCloudAt: '2020-01-01' }]);
    expect(s.oldestDays).toBeUndefined();
    expect(s.overdue).toBeUndefined();
  });

  it('handles a missing list without throwing', () => {
    expect(summarizeReceiptStorage(undefined).totalFiles).toBe(0);
  });
});

describe('which expenses the reclaim walks', () => {
  it('pairs each expense with the folder its receipts belong in', () => {
    const owners = receiptOwners(
      [{ id: 1 }],
      { b1: { expenses: [{ id: 2 }] } },
      { b1: { title: 'The Quiet Hour' } }
    );
    expect(owners).toHaveLength(2);
    expect(owners[0]).toMatchObject({ subfolder: 'General', scope: 'tax' });
    expect(owners[1]).toMatchObject({ subfolder: 'The Quiet Hour', scope: 'book', bid: 'b1' });
  });

  it('skips books whose data never loaded', () => {
    // Their `expenses` is the empty default standing in for data nobody has
    // seen — walking it would write that emptiness back over the real ledger.
    const owners = receiptOwners([], { b1: { _loadFailed: true, expenses: [{ id: 1 }] } }, {});
    expect(owners).toEqual([]);
  });

  it('falls back to the book id when a title is missing', () => {
    const owners = receiptOwners([], { b1: { expenses: [{ id: 1 }] } }, {});
    expect(owners[0].subfolder).toBe('b1');
  });

  it('tolerates absent inputs', () => {
    expect(receiptOwners(undefined, undefined, undefined)).toEqual([]);
  });
});

describe('filename collisions', () => {
  it('suffixes rather than overwriting a receipt saved the same day', () => {
    // `create: true` + createWritable() truncates, so a collision is silent
    // loss of a tax record.
    const taken = new Set(['2026-08-12_receipt.jpg', '2026-08-12_receipt-2.jpg']);
    return uniqueFileName('2026-08-12_receipt.jpg', async (n) => taken.has(n))
      .then(name => expect(name).toBe('2026-08-12_receipt-3.jpg'));
  });

  it('leaves a free name alone', async () => {
    expect(await uniqueFileName('a.pdf', async () => false)).toBe('a.pdf');
  });

  it('keeps the extension when suffixing, and copes with no extension', async () => {
    expect(await uniqueFileName('scan.pdf', async (n) => n === 'scan.pdf')).toBe('scan-2.pdf');
    expect(await uniqueFileName('scan', async (n) => n === 'scan')).toBe('scan-2');
  });
});

describe('reclaiming one receipt from the cloud', () => {
  function harness({ fetchImpl, saveImpl, deleteImpl }) {
    const deleted = [];
    return {
      deleted,
      run: buildHarness({
        names: ['reclaimOneReceipt'],
        deps: {
          fetch: fetchImpl,
          File: class { constructor(parts, name, opts) { this.parts = parts; this.name = name; this.type = opts?.type; } },
          saveReceiptToLocalFile: saveImpl,
          toLocalRef,
          window: {
            _fbDeleteReceipt: deleteImpl || (async (url) => { deleted.push(url); }),
          },
          console: { error: () => {}, warn: () => {} },
        },
        returns: 'reclaimOneReceipt',
      }),
    };
  }

  const okFetch = async () => ({ ok: true, status: 200, blob: async () => ({ type: 'image/jpeg' }) });

  it('files the receipt locally, then drops the cloud copy', async () => {
    const h = harness({
      fetchImpl: okFetch,
      saveImpl: async () => 'local://General/2026-08-12_receipt.jpg',
    });
    const ref = await h.run('https://cloud/o%2F2026-08-12_receipt.jpg?token=x', 'General');
    expect(ref).toBe('local://General/2026-08-12_receipt.jpg');
    expect(h.deleted).toEqual(['https://cloud/o%2F2026-08-12_receipt.jpg?token=x']);
  });

  it('keeps the cloud copy when the local write fails', async () => {
    // The whole safety property: deleting first would destroy the only copy.
    const h = harness({ fetchImpl: okFetch, saveImpl: async () => null });
    const ref = await h.run('https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg', 'General');
    expect(ref).toBeNull();
    expect(h.deleted).toEqual([]);
  });

  it('keeps the cloud copy when the download fails', async () => {
    const h = harness({
      fetchImpl: async () => { throw new Error('offline'); },
      saveImpl: async () => 'local://General/x.jpg',
    });
    expect(await h.run('https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg', 'General')).toBeNull();
    expect(h.deleted).toEqual([]);
  });

  it('keeps the cloud copy on a non-OK response', async () => {
    const saveImpl = vi.fn(async () => 'local://General/x.jpg');
    const h = harness({ fetchImpl: async () => ({ ok: false, status: 404 }), saveImpl });
    expect(await h.run('https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg', 'General')).toBeNull();
    expect(saveImpl).not.toHaveBeenCalled();
    expect(h.deleted).toEqual([]);
  });

  it('records why a download failed, not just that it did', async () => {
    // The whole point of the diagnostic: 40 receipts failing identically is one
    // problem with one fix, and "check your connection" hid which one.
    const problems = [];
    const h = harness({ fetchImpl: async () => ({ ok: false, status: 404 }), saveImpl: async () => null });
    await h.run('https://cloud/gone.jpg', { desc: 'Uber' }, problems);
    expect(problems).toHaveLength(1);
    expect(problems[0].stage).toBe('download');
    expect(problems[0].detail).toMatch(/404/);
    expect(problems[0].detail).toMatch(/no longer in cloud storage/i);
    expect(problems[0].desc).toBe('Uber');
  });

  it('distinguishes access denied from a missing file', async () => {
    const problems = [];
    const h = harness({ fetchImpl: async () => ({ ok: false, status: 403 }), saveImpl: async () => null });
    await h.run('https://cloud/denied.jpg', {}, problems);
    expect(problems[0].detail).toMatch(/access denied/i);
  });

  it('records a network rejection separately from a bad status', async () => {
    const problems = [];
    const h = harness({
      fetchImpl: async () => { throw Object.assign(new Error('Failed to fetch'), { name: 'TypeError' }); },
      saveImpl: async () => null,
    });
    await h.run('https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg', {}, problems);
    expect(problems[0].detail).toMatch(/TypeError: Failed to fetch/);
  });

  it('records a save failure as a different stage than a download failure', async () => {
    const problems = [];
    const h = harness({ fetchImpl: okFetch, saveImpl: async () => null });
    await h.run('https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg', {}, problems);
    expect(problems[0].stage).toBe('save');
  });

  it('returns a prefixed reference even if the saver hands back a bare path', async () => {
    const h = harness({ fetchImpl: okFetch, saveImpl: async () => 'General/x.jpg' });
    expect(await h.run('https://firebasestorage.googleapis.com/v0/b/x/o/x.jpg', 'General')).toBe('local://General/x.jpg');
  });
});

describe('cloud fallback wiring', () => {
  it('saves a receipt to the folder first and the cloud second', () => {
    // These moved to src/features/receipts.js, where the module exports its
    // whole surface in one trailing block rather than marking each
    // declaration. The function still has to exist; the `export` keyword on
    // the declaration line is no longer how that is expressed.
    expect(appSource).toContain('async function uploadReceiptToCloud');
    expect(appSource).toContain('async function saveReceiptBestEffort');
    // Every place a receipt is attached goes through the shared best-effort
    // saver: the Tax Centre form, the per-book form, the row drag-drop, and
    // the batch sheet's two destinations.
    const callSites = appSource.match(/await saveReceiptBestEffort\(/g) || [];
    expect(callSites.length).toBe(5);
    expect(appSource).toContain("saveReceiptBestEffort(file, 'General', { date, desc, cat, amount, currency })");
    expect(appSource).toContain('await saveReceiptBestEffort(file, book.title, {');
    expect(appSource).toContain('await saveReceiptBestEffort(file, subfolder)');
  });

  it('stamps when a receipt started waiting in the cloud', () => {
    expect(appSource).toContain("if (receiptStorage === 'cloud') entry.receiptCloudAt");
    expect(appSource).toContain("if (receiptStorage === 'cloud') newExpense.receiptCloudAt");
  });

  it('asks before logging an expense whose receipt could not be saved at all', () => {
    expect(appSource).toContain("if (receiptStorage === 'none')");
    expect(appSource).toContain('Log without receipt');
  });

  it('clears the waiting stamp once nothing is left in the cloud', () => {
    expect(appSource).toContain('delete exp.receiptCloudAt');
  });

  it('avoids clobbering an existing file when saving locally', () => {
    expect(appSource).toContain('await uniqueFileName(');
  });

  it('exposes the reclaim to the Tax Centre button', () => {
    expect(appSource).toContain('async function reclaimCloudReceipts');
    expect(appSource).toContain('async function reclaimCloudReceiptsNow');
    expect(html).toContain('id="tc-reclaim-btn"');
    expect(html).toContain('onclick="reclaimCloudReceiptsNow()"');
  });

  it('shows a neutral storage readout in the Tax Centre', () => {
    expect(html).toContain('id="tc-cloud-backlog"');
    expect(appSource).toContain('function _tcRenderReceiptStorage');
    expect(css).toContain('.tc-cloud-backlog');
  });

  it('runs a quiet reclaim at startup rather than nagging on load', () => {
    expect(appSource).toContain('reclaimCloudReceipts({ interactive: false })');
  });

  it('keeps receipt management out of the single-expense form', () => {
    // These bulk actions used to sit inside #tc-exp-file-group, which is for
    // logging one expense. They belong to the receipt library.
    const formStart = html.indexOf('id="tc-exp-file-group"');
    const formEnd = html.indexOf('id="tc-exp-trip"');
    const form = html.slice(formStart, formEnd);
    ['cacheAllReceiptsNow()', 'batchScanAndRelinkReceipts()', 'reclaimCloudReceiptsNow()', 'openCloudReceiptsModal()']
      .forEach(handler => expect(form).not.toContain(handler));
    expect(html).toContain('tc-receipts-card');
  });

  it('explains a failed batch instead of blaming the connection', () => {
    // These moved to src/features/receipts.js, where the module exports its
    // whole surface in one trailing block rather than marking each
    // declaration. The function still has to exist; the `export` keyword on
    // the declaration line is no longer how that is expressed.
    expect(appSource).toContain('function summarizeReceiptProblems');
    expect(appSource).toContain('function formatReceiptDiagnostic');
    expect(appSource).toContain('function renderReceiptProblemPanel');
    expect(html).toContain('id="tc-receipt-problems"');
    // The button is rendered with the panel, so it lives in the source rather
    // than in the static markup.
    expect(appSource).toContain('onclick="copyReceiptDiagnostic()"');
    // The old catch-all message must be gone.
    expect(appSource).not.toContain('check your connection and try again');
  });

  it('supports dismissing and restoring receipt advisory notices', () => {
    expect(appSource).toContain('function dismissReceiptNotice');
    expect(appSource).toContain('function resetDismissedReceiptNotices');
    expect(appSource).toContain('function isReceiptNoticeDismissed');
    expect(html).toContain('id="tc-reset-notices-btn"');
    expect(css).toContain('.tc-alert-dismiss');
  });
});

