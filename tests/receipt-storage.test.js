import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appSource, buildHarness } from './helpers/extract-decl.js';
import {
  CLOUD_RECEIPT_REMINDER_DAYS,
  cloudPendingSince,
  cloudReceiptRefs,
  daysWaiting,
  hasCloudReceipt,
  isCloudReceipt,
  isLocalReceipt,
  localRefPath,
  receiptOwners,
  receiptRefsOf,
  summarizeCloudBacklog,
  toLocalRef,
  uniqueFileName,
  writeReceiptRefs,
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
    writeReceiptRefs(exp, ['local://General/new.jpg', 'https://cloud/x.jpg']);
    expect(exp.receiptFiles).toEqual(['local://General/new.jpg', 'https://cloud/x.jpg']);
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
    const exp = { receiptFiles: ['local://a.jpg', 'https://cloud/b.jpg', 'https://cloud/c.jpg'] };
    expect(cloudReceiptRefs(exp)).toEqual(['https://cloud/b.jpg', 'https://cloud/c.jpg']);
    expect(hasCloudReceipt(exp)).toBe(true);
    expect(hasCloudReceipt({ receiptFiles: ['local://a.jpg'] })).toBe(false);
  });
});

describe('how long a receipt has been waiting in the cloud', () => {
  const now = new Date('2026-08-12T12:00:00Z');

  it('counts from the stamp written when the fallback happened', () => {
    const exp = { receipt: 'https://cloud/x.jpg', receiptCloudAt: '2026-08-01T12:00:00Z' };
    expect(daysWaiting(exp, now)).toBe(11);
  });

  it('falls back to the expense date for receipts that predate the stamp', () => {
    const exp = { receipt: 'https://cloud/x.jpg', date: '2026-07-29' };
    expect(cloudPendingSince(exp)).toBeInstanceOf(Date);
    expect(daysWaiting(exp, now)).toBe(14);
  });

  it('reports nothing for a receipt already filed locally', () => {
    expect(daysWaiting({ receipt: 'local://x.jpg', receiptCloudAt: '2020-01-01' }, now)).toBe(0);
    expect(cloudPendingSince({ receipt: 'local://x.jpg' })).toBeNull();
  });

  it('survives an unparseable date instead of reporting a nonsense age', () => {
    expect(daysWaiting({ receipt: 'https://cloud/x.jpg', receiptCloudAt: 'not a date' }, now)).toBe(0);
    expect(daysWaiting({ receipt: 'https://cloud/x.jpg' }, now)).toBe(0);
  });
});

describe('cloud backlog summary', () => {
  const now = new Date('2026-08-12T12:00:00Z');

  it('counts expenses and files separately', () => {
    const items = [
      { receiptFiles: ['https://cloud/a.jpg', 'https://cloud/b.jpg'], receiptCloudAt: '2026-08-10T12:00:00Z' },
      { receipt: 'https://cloud/c.jpg', receiptCloudAt: '2026-08-11T12:00:00Z' },
      { receipt: 'local://filed.jpg' },
      { receipt: '' },
    ];
    const s = summarizeCloudBacklog(items, now);
    expect(s.expenses).toBe(2);
    expect(s.files).toBe(3);
    expect(s.oldestDays).toBe(2);
    expect(s.overdue).toBe(0);
  });

  it('flags the ones past the reminder threshold', () => {
    const items = [
      { receipt: 'https://cloud/old.jpg', receiptCloudAt: '2026-07-01T12:00:00Z' },
      { receipt: 'https://cloud/new.jpg', receiptCloudAt: '2026-08-11T12:00:00Z' },
    ];
    const s = summarizeCloudBacklog(items, now);
    expect(s.overdue).toBe(1);
    expect(s.oldestDays).toBe(42);
    expect(s.thresholdDays).toBe(CLOUD_RECEIPT_REMINDER_DAYS);
  });

  it('is empty and quiet when everything is already filed', () => {
    const s = summarizeCloudBacklog([{ receipt: 'local://a.jpg' }, {}], now);
    expect(s).toMatchObject({ expenses: 0, files: 0, oldestDays: 0, overdue: 0 });
  });

  it('handles a missing list without throwing', () => {
    expect(summarizeCloudBacklog(undefined, now).expenses).toBe(0);
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
          console: { error: () => {} },
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
    const ref = await h.run('https://cloud/x.jpg', 'General');
    expect(ref).toBeNull();
    expect(h.deleted).toEqual([]);
  });

  it('keeps the cloud copy when the download fails', async () => {
    const h = harness({
      fetchImpl: async () => { throw new Error('offline'); },
      saveImpl: async () => 'local://General/x.jpg',
    });
    expect(await h.run('https://cloud/x.jpg', 'General')).toBeNull();
    expect(h.deleted).toEqual([]);
  });

  it('keeps the cloud copy on a non-OK response', async () => {
    const saveImpl = vi.fn(async () => 'local://General/x.jpg');
    const h = harness({ fetchImpl: async () => ({ ok: false, status: 404 }), saveImpl });
    expect(await h.run('https://cloud/x.jpg', 'General')).toBeNull();
    expect(saveImpl).not.toHaveBeenCalled();
    expect(h.deleted).toEqual([]);
  });

  it('returns a prefixed reference even if the saver hands back a bare path', async () => {
    const h = harness({ fetchImpl: okFetch, saveImpl: async () => 'General/x.jpg' });
    expect(await h.run('https://cloud/x.jpg', 'General')).toBe('local://General/x.jpg');
  });
});

describe('cloud fallback wiring', () => {
  it('saves a receipt to the folder first and the cloud second', () => {
    expect(appSource).toContain('export async function uploadReceiptToCloud');
    expect(appSource).toContain('export async function saveReceiptBestEffort');
    // Both expense entry points go through the shared best-effort saver.
    expect(appSource).toContain("await saveReceiptBestEffort(file, 'General')");
    expect(appSource).toContain('await saveReceiptBestEffort(file, book.title)');
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

  it('shows the waiting-receipts prompt in the Tax Centre', () => {
    expect(html).toContain('id="tc-cloud-backlog"');
    expect(appSource).toContain('function _tcRenderCloudBacklog');
    expect(css).toContain('.tc-cloud-backlog');
    expect(css).toContain('.tc-cloud-backlog.is-stale');
  });

  it('runs a quiet reclaim at startup rather than nagging on load', () => {
    expect(appSource).toContain('reclaimCloudReceipts({ interactive: false })');
  });
});
