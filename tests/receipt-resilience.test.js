import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appSource, buildHarness } from './helpers/extract-decl.js';
import {
  MAX_SEGMENT_LENGTH,
  amountPart,
  cleanDescription,
  datePart,
  describeDestination,
  extensionFor,
  receiptFileName,
  receiptFolderPath,
  receiptRelativePath,
  safeFolderSegment,
  safeSegment,
  yearPart,
} from '../src/lib/receipt-naming.js';
import {
  ORIGINAL_KEEP_MAX_BYTES,
  RECEIPT_CACHE_BUDGET_BYTES,
  cacheKeyFor,
  cachePlanFor,
  cacheStats,
  formatCacheSize,
  isImage,
  isPdf,
  planEviction,
  previewDimensions,
  uncachedRefs,
} from '../src/lib/receipt-cache.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');

describe('filesystem-safe naming', () => {
  it('strips characters that are illegal or dangerous in a path', () => {
    // `/` would silently create a folder level rather than a filename.
    expect(safeSegment('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('removes control characters', () => {
    const ctrl = `a${String.fromCharCode(9)}b${String.fromCharCode(0)}c${String.fromCharCode(127)}d`;
    expect(safeSegment(ctrl)).toBe('a-b-c-d');
  });

  it('folds accents instead of dropping the word', () => {
    expect(safeSegment('Café Bleu — Dîner')).toBe('Cafe-Bleu-Diner');
    expect(safeSegment('Ürsula Ökonomie')).toBe('Ursula-Okonomie');
  });

  it('escapes the Windows device names that no extension rescues', () => {
    expect(safeSegment('CON')).toBe('CON-file');
    expect(safeSegment('lpt1')).toBe('lpt1-file');
    expect(safeSegment('console')).toBe('console');
  });

  it('refuses leading dots and trailing dots', () => {
    // A leading dot hides the file; a trailing dot is dropped by Windows.
    expect(safeSegment('.hidden')).toBe('hidden');
    expect(safeSegment('trailing...')).toBe('trailing');
  });

  it('bounds segment length', () => {
    expect(safeSegment('x'.repeat(400)).length).toBeLessThanOrEqual(MAX_SEGMENT_LENGTH);
    expect(safeSegment('y'.repeat(400), 20).length).toBeLessThanOrEqual(20);
  });

  it('keeps spaces in folder names but not in filenames', () => {
    // A folder gets read in Finder; a filename gets pasted into things.
    expect(safeFolderSegment('Office Supplies')).toBe('Office Supplies');
    expect(safeSegment('Office Supplies')).toBe('Office-Supplies');
  });

  it('never returns something empty-but-dangerous for junk input', () => {
    expect(safeSegment('///')).toBe('');
    expect(safeSegment(null)).toBe('');
    expect(safeSegment(undefined)).toBe('');
  });
});

describe('receipt filenames', () => {
  const now = new Date('2026-08-13T00:00:00Z');

  it('names a receipt after the expense, date first', () => {
    expect(receiptFileName({
      date: '2026-05-10', desc: 'Staples', amount: 24.99, currency: 'CAD', originalName: 'IMG_4021.HEIC',
    }, now)).toBe('2026-05-10_Staples_CAD-24.99.heic');
  });

  it('drops the bookkeeping noise the app itself appended', () => {
    expect(cleanDescription('Adobe CC (Recurring)')).toBe('Adobe CC');
    expect(cleanDescription('Hotel Berlin (Paid EUR 220.00)')).toBe('Hotel Berlin');
    expect(receiptFileName({
      date: '2026-01-02', desc: 'Adobe CC (Recurring)', amount: 74.99, currency: 'CAD', originalName: 'x.pdf',
    }, now)).toBe('2026-01-02_Adobe-CC_CAD-74.99.pdf');
  });

  it('falls back to the original name when there is nothing else to go on', () => {
    // Otherwise a folder fills with indistinguishable "2026-08-13.jpg".
    expect(receiptFileName({ date: '', originalName: 'scan.pdf' }, now)).toBe('2026-08-13_scan.pdf');
  });

  it('distinguishes second and later attachments on one expense', () => {
    const base = { date: '2026-05-10', desc: 'Staples', amount: 24.99, currency: 'CAD', originalName: 'a.jpg' };
    expect(receiptFileName(base, now)).toBe('2026-05-10_Staples_CAD-24.99.jpg');
    expect(receiptFileName({ ...base, index: 1 }, now)).toBe('2026-05-10_Staples_CAD-24.99_2.jpg');
  });

  it('omits a zero or unusable amount rather than writing NA-0.00', () => {
    expect(amountPart(0, 'CAD')).toBe('');
    expect(amountPart(null, 'CAD')).toBe('');
    expect(amountPart(24.5, 'usd')).toBe('USD-24.50');
  });

  it('takes the extension from the name, then the MIME type', () => {
    expect(extensionFor('a.PDF', '')).toBe('pdf');
    expect(extensionFor('noext', 'application/pdf')).toBe('pdf');
    expect(extensionFor('noext', 'image/png')).toBe('png');
    expect(extensionFor('', '')).toBe('bin');
  });

  it('keeps the whole name inside filesystem limits', () => {
    const name = receiptFileName({
      date: '2026-05-10', desc: 'x'.repeat(300), amount: 1, currency: 'CAD', originalName: 'a.jpg',
    }, now);
    expect(name.length).toBeLessThanOrEqual(MAX_SEGMENT_LENGTH + 8);
  });
});

describe('receipt folders', () => {
  const now = new Date('2026-08-13T00:00:00Z');

  it('files by tax year then category — the order the questions come in', () => {
    expect(receiptFolderPath({ date: '2026-05-10', cat: 'Office Supplies' }, now))
      .toEqual(['2026', 'Office Supplies']);
  });

  it('adds the book as a third level so a title stays collectable', () => {
    expect(receiptRelativePath({
      date: '2026-03-01', cat: 'Printing & Production', book: 'The Quiet Hour',
      desc: 'Proof copies', amount: 310, currency: 'CAD', originalName: 'a.pdf',
    }, now)).toBe('2026/Printing & Production/The Quiet Hour/2026-03-01_Proof-copies_CAD-310.00.pdf');
  });

  it('uses the expense year, not today, so a late-filed receipt lands right', () => {
    expect(yearPart('2024-12-31', now)).toBe('2024');
    expect(datePart('2024-12-31', now)).toBe('2024-12-31');
  });

  it('falls back to today only when the date is unusable', () => {
    expect(datePart('', now)).toBe('2026-08-13');
    expect(datePart('nonsense', now)).toBe('2026-08-13');
  });

  it('names an uncategorised receipt rather than dropping it at the root', () => {
    expect(receiptFolderPath({ date: '2026-05-10' }, now)).toEqual(['2026', 'Uncategorised']);
  });

  it('describes the destination the way the owner would say it', () => {
    expect(describeDestination({ date: '2026-05-10', cat: 'Office Supplies' }, now))
      .toBe('2026 › Office Supplies');
  });
});

describe('what is worth caching', () => {
  it('treats a reference and a bare path as the same entry', () => {
    expect(cacheKeyFor('local://2026/Office Supplies/a.jpg')).toBe('2026/Office Supplies/a.jpg');
    expect(cacheKeyFor('2026/Office Supplies/a.jpg')).toBe('2026/Office Supplies/a.jpg');
    expect(cacheKeyFor('')).toBe('');
  });

  it('keeps small images whole and downscales big ones', () => {
    expect(cachePlanFor({ size: 400 * 1024, type: 'image/jpeg', name: 'a.jpg' }).store).toBe('original');
    expect(cachePlanFor({ size: 6 * 1024 * 1024, type: 'image/jpeg', name: 'a.jpg' }).store).toBe('preview');
    expect(cachePlanFor({ size: ORIGINAL_KEEP_MAX_BYTES, type: 'image/png', name: 'a.png' }).store).toBe('original');
  });

  it('keeps PDFs whole, since they cannot be downscaled here', () => {
    expect(cachePlanFor({ size: 2 * 1024 * 1024, type: 'application/pdf', name: 'a.pdf' }).store).toBe('original');
    expect(cachePlanFor({ size: 40 * 1024 * 1024, type: 'application/pdf', name: 'a.pdf' }).store).toBe('skip');
  });

  it('recognises type from the extension when the MIME type is missing', () => {
    expect(isPdf('', 'scan.PDF')).toBe(true);
    expect(isImage('', 'photo.HEIC')).toBe(true);
    expect(isImage('', 'notes.txt')).toBe(false);
  });

  it('skips an empty file rather than caching nothing', () => {
    expect(cachePlanFor({ size: 0, type: 'image/jpeg', name: 'a.jpg' }).store).toBe('skip');
  });
});

describe('preview sizing', () => {
  it('fits inside the bound while keeping the shape', () => {
    const p = previewDimensions(4000, 3000, 2000);
    expect(p).toMatchObject({ width: 2000, height: 1500, scaled: true });
  });

  it('never upscales a small image', () => {
    expect(previewDimensions(800, 600, 2000)).toMatchObject({ width: 800, height: 600, scaled: false });
  });

  it('survives a zero-sized image', () => {
    expect(previewDimensions(0, 0, 2000).width).toBeGreaterThan(0);
  });
});

describe('cache eviction', () => {
  it('does nothing while under budget', () => {
    expect(planEviction([{ key: 'a', size: 10, lastSeenAt: '2020-01-01' }], 100)).toEqual([]);
  });

  it('drops least-recently-seen first', () => {
    // Recency beats age: a two-year-old receipt opened last week is in use.
    const entries = [
      { key: 'old-but-opened', size: 60, lastSeenAt: '2026-08-01' },
      { key: 'stale', size: 60, lastSeenAt: '2024-01-01' },
      { key: 'fresh', size: 60, lastSeenAt: '2026-08-12' },
    ];
    expect(planEviction(entries, 150)).toEqual(['stale']);
  });

  it('keeps dropping until it is under budget', () => {
    const entries = [
      { key: 'a', size: 100, lastSeenAt: '2024-01-01' },
      { key: 'b', size: 100, lastSeenAt: '2024-02-01' },
      { key: 'c', size: 100, lastSeenAt: '2024-03-01' },
    ];
    expect(planEviction(entries, 100)).toEqual(['a', 'b']);
  });

  it('has a budget that is a real number of bytes', () => {
    expect(RECEIPT_CACHE_BUDGET_BYTES).toBeGreaterThan(10 * 1024 * 1024);
  });
});

describe('cache reporting', () => {
  it('counts entries, bytes and previews', () => {
    const s = cacheStats([
      { key: 'a', size: 100, kind: 'original' },
      { key: 'b', size: 200, kind: 'preview' },
    ]);
    expect(s).toEqual({ count: 2, bytes: 300, previews: 1 });
  });

  it('finds the receipts with no standby copy yet', () => {
    const refs = ['local://a.jpg', 'local://b.jpg', 'local://a.jpg'];
    expect(uncachedRefs(refs, ['a.jpg'])).toEqual(['local://b.jpg']);
  });

  it('formats sizes for a human', () => {
    expect(formatCacheSize(512)).toBe('512 B');
    expect(formatCacheSize(2048)).toBe('2 KB');
    expect(formatCacheSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('viewing a receipt when the folder has moved', () => {
  function harness({ folderFile, cached, handle = {} }) {
    const opened = [];
    const toasts = [];
    const dialogs = [];
    return {
      opened, toasts, dialogs,
      run: buildHarness({
        names: ['viewLocalReceipt'],
        deps: {
          loadReceiptFolderHandle: async () => handle,
          resolveLocalReceiptFile: async () => {
            if (!folderFile) throw new Error('not found in connected folder');
            return folderFile;
          },
          readCachedReceipt: async () => cached,
          openBlobInTab: (blob) => { opened.push(blob); },
          cacheReceiptFile: async () => true,
          _noteReceiptFolderHealth: () => {},
          showToast: (msg, kind) => { toasts.push({ msg, kind }); },
          handleFolderError: async (_e, title) => { dialogs.push(title); return false; },
          console: { warn: () => {} },
        },
        returns: 'viewLocalReceipt',
      }),
    };
  }

  const grantedHandle = { queryPermission: async () => 'granted' };

  it('opens the real file when the folder is reachable', async () => {
    const file = { name: 'real.jpg' };
    const h = harness({ folderFile: file, cached: null, handle: grantedHandle });
    await h.run('2026/Office Supplies/real.jpg');
    expect(h.opened).toEqual([file]);
    expect(h.dialogs).toEqual([]);
  });

  it('falls back to the saved copy when the folder has moved', async () => {
    // The bug being fixed: this used to raise a dialog per receipt and show
    // nothing, so a moved folder blanked the whole ledger at once.
    const blob = { name: 'cached.jpg' };
    const h = harness({ folderFile: null, cached: { blob, kind: 'original' }, handle: grantedHandle });
    await h.run('2026/Office Supplies/real.jpg');
    expect(h.opened).toEqual([blob]);
    expect(h.dialogs).toEqual([]);
    expect(h.toasts[0].msg).toMatch(/saved copy/i);
  });

  it('uses the saved copy when no folder is connected at all', async () => {
    const blob = { name: 'cached.jpg' };
    const h = harness({ folderFile: null, cached: { blob, kind: 'preview' }, handle: null });
    await h.run('a.jpg');
    expect(h.opened).toEqual([blob]);
    expect(h.toasts[0].msg).toMatch(/original/i);
  });

  it('only asks to reconnect when there is genuinely nothing to show', async () => {
    const h = harness({ folderFile: null, cached: null, handle: grantedHandle });
    await h.run('a.jpg');
    expect(h.opened).toEqual([]);
    expect(h.dialogs).toEqual(['Receipt Not Found']);
  });

  it('falls back rather than failing when permission was not granted', async () => {
    const blob = { name: 'cached.jpg' };
    const h = harness({
      folderFile: { name: 'real.jpg' },
      cached: { blob, kind: 'original' },
      handle: { queryPermission: async () => 'prompt', requestPermission: async () => 'denied' },
    });
    await h.run('a.jpg');
    expect(h.opened).toEqual([blob]);
  });
});

describe('resilience wiring', () => {
  it('keeps a standby copy whenever a receipt is filed locally', () => {
    expect(appSource).toContain('async function cacheReceiptFile');
    expect(appSource).toContain('await cacheReceiptFile(relative, file)');
  });

  it('refreshes the standby copy when the real file is opened', () => {
    expect(appSource).toContain('cacheReceiptFile(path, file)');
  });

  it('backfills receipts filed before the cache existed', () => {
    expect(appSource).toContain('async function backfillReceiptCache');
    expect(appSource).toContain('async function cacheAllReceiptsNow');
    expect(html).toContain('id="tc-cache-btn"');
    expect(html).toContain('onclick="cacheAllReceiptsNow()"');
  });

  it('reports a vanished folder once instead of a dialog per receipt', () => {
    expect(appSource).toContain('async function checkReceiptFolderHealth');
    expect(appSource).toContain('function renderReceiptFolderAlert');
    expect(html).toContain('id="tc-folder-alert"');
    expect(css).toContain('.tc-folder-alert');
  });

  it('shows what is waiting in the cloud before moving it', () => {
    expect(appSource).toContain('function cloudReceiptQueue');
    expect(appSource).toContain('function openCloudReceiptsModal');
    expect(html).toContain('id="m-cloud-receipts"');
    expect(html).toContain('id="cloud-receipts-body"');
    expect(html).toContain('onclick="openCloudReceiptsModal()"');
    expect(css).toContain('.cloud-receipt-row');
  });

  it('files reclaimed receipts by year and category', () => {
    expect(appSource).toContain('receiptFolderPath({ ...meta, book: meta.book || subfolderName })');
    expect(appSource).toContain('receiptFileName({ ...meta, originalName: file.name, mimeType: file.type })');
  });

  it('reports how many receipts are viewable offline', () => {
    expect(appSource).toContain('async function renderReceiptCacheStatus');
    expect(html).toContain('id="tc-cache-status"');
  });
});
