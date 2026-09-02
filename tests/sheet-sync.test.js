import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SHEET_ROW_KINDS,
  sheetRowKind,
  sheetLogLabel,
  sheetLogSummary,
  sheetRowSortKey,
  compareSheetPayloads,
  sortSheetPayloads,
} from '../src/lib/sheet-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
const codeGs = fs.readFileSync(path.resolve(__dirname, '../apps-script/Code.gs'), 'utf8');

describe('sheet row classification', () => {
  it('tells an actual sale apart from a consignment movement', () => {
    expect(sheetRowKind({ type: 'order', num: '#XCMO-587192' })).toBe(SHEET_ROW_KINDS.ORDER);
    expect(sheetRowKind({ type: 'consignment', store: 'Massy Books' })).toBe(SHEET_ROW_KINDS.CONSIGNMENT);
    expect(sheetLogLabel({ type: 'order' })).toBe('Order');
    expect(sheetLogLabel({ type: 'consignment' })).toBe('Consignment');
  });

  it('files a customer-paid postage row as Shipping, not Consignment', () => {
    // The regression: the log used `type === 'order' ? 'Order' : 'Consignment'`,
    // so every postage row was announced as stock sitting at a store partner.
    const postage = { type: 'shipping', num: '#OLPM-453976', chan: 'Website shipping', total: 25 };
    expect(sheetRowKind(postage)).toBe(SHEET_ROW_KINDS.SHIPPING);
    expect(sheetLogLabel(postage)).toBe('Shipping');
    expect(sheetLogLabel(postage)).not.toBe('Consignment');
  });

  it('never renders the word "undefined" in a summary', () => {
    // A shipping payload carries no store, no event and no quantity, which is
    // what produced "undefined · undefined · ×" in the sync log.
    const payloads = [
      { type: 'shipping', num: '#OLPM-453976', total: 25 },
      { type: 'shipping' },
      { type: 'order' },
      { type: 'consignment' },
      { type: 'consignment', store: 'Massy Books' },
      { action: 'delete', type: 'shipping', num: '#YDVW-123967' },
      { action: 'reset', type: 'control' },
      { action: 'batch', rows: [] },
      {},
    ];
    for (const payload of payloads) {
      const summary = sheetLogSummary(payload);
      expect(summary, JSON.stringify(payload)).not.toMatch(/undefined|null|NaN/);
      expect(summary.length).toBeGreaterThan(0);
    }
  });

  it('summarises each kind in its own terms', () => {
    expect(sheetLogSummary({ type: 'order', num: '#XCMO-587192', chan: 'Website', qty: 1 }))
      .toBe('#XCMO-587192 · Website · 1×');
    expect(sheetLogSummary({ type: 'consignment', store: 'Massy Books', event: 'Sale', qty: 2 }))
      .toBe('Massy Books · Sale · 2×');
    expect(sheetLogSummary({ type: 'shipping', num: '#OLPM-453976', total: 25 }))
      .toBe('#OLPM-453976 · postage paid 25');
    expect(sheetLogSummary({ action: 'reset', type: 'control' })).toBe('Clear sheet for rebuild');
    expect(sheetLogSummary({ action: 'batch', rows: new Array(60) })).toBe('Bulk sync · 60 records');
  });

  it('spells out a removal instead of reading like an add', () => {
    expect(sheetLogSummary({ action: 'delete', type: 'order', num: '#WZDK-689407' }))
      .toBe('#WZDK-689407 · remove row');
    expect(sheetLogSummary({ action: 'delete', type: 'consignment', store: 'Massy Books' }))
      .toBe('Massy Books · remove row');
    expect(sheetLogSummary({ action: 'void', type: 'shipping', num: '#WZDK-689407' }))
      .toBe('#WZDK-689407 · remove postage row');
  });

  it('treats an unrecognised type as a direct sale, not a consignment', () => {
    // Calling a sale "consigned" implies a store owes money nobody owes.
    expect(sheetRowKind({ type: 'gratuity' })).toBe(SHEET_ROW_KINDS.ORDER);
    expect(sheetRowKind({})).toBe(SHEET_ROW_KINDS.ORDER);
    expect(sheetRowKind(null)).toBe(SHEET_ROW_KINDS.ORDER);
  });
});

describe('chronological ordering of sheet rows', () => {
  it('sorts plain YYYY-MM-DD dates oldest first', () => {
    const rows = [
      { date: '2026-09-02', num: 'newest' },
      { date: '2026-07-10', num: 'oldest' },
      { date: '2026-08-15', num: 'middle' },
    ];
    expect(sortSheetPayloads(rows).map(r => r.num)).toEqual(['oldest', 'middle', 'newest']);
  });

  it('is stable, so an order and its postage row stay adjacent', () => {
    const rows = [
      { date: '2026-07-10', type: 'order', num: '#A' },
      { date: '2026-07-10', type: 'shipping', num: '#A' },
      { date: '2026-07-10', type: 'order', num: '#B' },
      { date: '2026-07-10', type: 'shipping', num: '#B' },
    ];
    expect(sortSheetPayloads(rows).map(r => `${r.num}:${r.type}`))
      .toEqual(['#A:order', '#A:shipping', '#B:order', '#B:shipping']);
  });

  it('sorts a removal ahead of an addition on the same date', () => {
    // Otherwise a re-sync appends the replacement and then deletes it again.
    const rows = [
      { date: '2026-08-21', action: 'add', num: 'keep' },
      { date: '2026-08-21', action: 'delete', num: 'drop' },
    ];
    expect(sortSheetPayloads(rows).map(r => r.num)).toEqual(['drop', 'keep']);
  });

  it('parks an unusable date at the end rather than the top', () => {
    expect(sheetRowSortKey({ date: '' })).toBe('9999-12-31');
    expect(sheetRowSortKey({ date: 'not a date' })).toBe('9999-12-31');
    expect(sheetRowSortKey({})).toBe('9999-12-31');
    const rows = [{ date: '' }, { date: '2026-07-10' }];
    expect(sortSheetPayloads(rows).map(r => r.date)).toEqual(['2026-07-10', '']);
  });

  it('accepts Date objects and ISO timestamps from older backups', () => {
    expect(sheetRowSortKey({ date: new Date(Date.UTC(2026, 6, 10)) })).toBe('2026-07-10');
    expect(sheetRowSortKey({ date: '2026-07-10T14:03:00.000Z' })).toBe('2026-07-10');
    expect(compareSheetPayloads({ date: '2026-07-10' }, { date: '2026-08-15' })).toBeLessThan(0);
  });

  it('never mutates the array it was handed', () => {
    const rows = [{ date: '2026-09-02' }, { date: '2026-07-10' }];
    const before = rows.map(r => r.date);
    sortSheetPayloads(rows);
    expect(rows.map(r => r.date)).toEqual(before);
  });
});

describe('Sheets delivery queue (main.js)', () => {
  it('labels queued rows through the shared classifier, not an order/else ternary', () => {
    expect(mainJs).toContain("from './lib/sheet-sync.js'");
    expect(mainJs).toContain('const typeLabel = sheetLogLabel(payload);');
    expect(mainJs).toContain('const summary = sheetLogSummary(payload);');
    expect(mainJs).not.toContain("payload.type === 'order' ? 'Order' : 'Consignment'");
  });

  it('gives every write a hard deadline so one hung call cannot park the queue', () => {
    expect(mainJs).toContain('const SHEETS_WRITE_TIMEOUT_MS');
    expect(mainJs).toContain('const SHEETS_BATCH_TIMEOUT_MS');
    expect(mainJs).toContain('new AbortController()');
    expect(mainJs).toContain('controller.abort()');
    expect(mainJs).toContain('function fetchSheetsWithTimeout');
  });

  it('always releases the delivery lock, even when a write throws', () => {
    const proc = mainJs.match(/async function _processQueue\(\)[\s\S]+?\n\}/);
    expect(proc).not.toBeNull();
    expect(proc[0]).toContain('} finally {');
    expect(proc[0]).toContain('_sheetsWriting = false;');
    // The lock must be released in the finally, not on a single happy path.
    const finallyIdx = proc[0].indexOf('} finally {');
    expect(proc[0].indexOf('_sheetsWriting = false;')).toBeGreaterThan(finallyIdx);
  });

  it('waits out a row’s backoff instead of retrying on the next keystroke', () => {
    const proc = mainJs.match(/async function _processQueue\(\)[\s\S]+?\n\}/);
    expect(proc[0]).toContain('item.nextTryAt > Date.now()');
  });

  it('persists the queue and log without ever throwing', () => {
    const persist = mainJs.match(/function persistSheetsQueue\(\)[\s\S]+?\nfunction persistSheetsLog\(\)[\s\S]+?\n\}/);
    expect(persist).not.toBeNull();
    // A full localStorage used to throw out of the delivery loop before it
    // could release its lock, stopping Sheets syncing for the whole session.
    expect((persist[0].match(/try \{/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('never reports an unconfirmable no-cors send as Written', () => {
    // An opaque response proves only that the POST left the browser. Retrying
    // is idempotent (the backend replaces a row by its stable id), so an
    // unconfirmable write is retried rather than counted as delivered.
    expect(mainJs).toContain("if (resp === 'unknown') {");
    expect(mainJs).toContain('could not confirm the sheet received this row');
    // The log still knows how to render an unverified status for the paths
    // that legitimately cannot confirm, such as the connection test.
    expect(mainJs).toContain("'Sent (unverified)'");
  });

  it('pins each queued row to the sheet it was destined for', () => {
    // Opening the Test Profile swaps `sheetsUrl` for a mock endpoint, which
    // used to divert real pending rows into the simulator and drop them.
    expect(mainJs).toContain('function sheetsDestination()');
    expect(mainJs).toContain('...sheetsDestination()');
    expect(mainJs).toContain('const destination = item.url || realSheetsUrl();');
    expect(mainJs).toContain('simulate: !!item.simulated');
  });

  it('resolves the real sheet address, never the Test Profile stand-in', () => {
    expect(mainJs).toContain('function realSheetsUrl()');
    expect(mainJs).toContain('window._realSheetsUrlSaved ? (window._realSheetsUrl || \'\') : sheetsUrl');
    // A queued row is always a real record, so it is never marked simulated.
    expect(mainJs).toContain('return { url: realSheetsUrl(), simulated: false };');
    // And neither enqueue guard may test the swapped-out global.
    expect(mainJs).toContain('if (!realSheetsUrl() || !payload) return;');
    expect(mainJs).toContain('if (!realSheetsUrl() || !Array.isArray(rows) || !rows.length) return;');
  });

  it('lets postToSheets be told whether to simulate rather than inferring it', () => {
    const post = mainJs.match(/export async function postToSheets\([\s\S]+?\n\}/);
    expect(post).not.toBeNull();
    expect(post[0]).toContain("Object.prototype.hasOwnProperty.call(opts, 'simulate')");
  });

  it('keeps resuming a leftover queue after load, not just once at 300ms', () => {
    expect(mainJs).toContain('resumeSheetsQueueOnLoad');
    expect(mainJs).toContain("document.addEventListener('visibilitychange'");
  });

  it('sends bulk records in date order and in servable batch sizes', () => {
    expect(mainJs).toContain('sortSheetPayloads(toSync)');
    const size = mainJs.match(/const SHEETS_BULK_BATCH_SIZE = (\d+);/);
    expect(size).not.toBeNull();
    expect(Number(size[1])).toBeLessThanOrEqual(100);
  });
});

describe('Apps Script date ordering (Code.gs v41)', () => {
  const extract = (name) => {
    const match = codeGs.match(new RegExp(`function ${name}\\([\\s\\S]+?\\n\\}`));
    expect(match, `${name} must exist in Code.gs`).not.toBeNull();
    return match[0];
  };

  it('re-sorts every tab a write touched', () => {
    expect(codeGs).toContain('function sortSheetByDate_');
    expect(codeGs).toContain('function sortManagedSheets_');
    // Both write paths call it: the single-row upsert and the bulk batch.
    expect(codeGs).toContain('sortManagedSheets_(ss, [sheetName]);');
    expect(codeGs).toContain('sortManagedSheets_(ss, Object.keys(touchedSheets));');
  });

  it('orders rows oldest first, stably, with unusable dates last', () => {
    const rowSortKey_ = new Function('Utilities', 'Session', `
      ${extract('rowSortKey_')}
      return rowSortKey_;
    `)(
      { formatDate: (d) => d.toISOString().slice(0, 10) },
      { getScriptTimeZone: () => 'UTC' }
    );
    expect(rowSortKey_(new Date(Date.UTC(2026, 6, 10)))).toBe('2026-07-10');
    expect(rowSortKey_('2026-08-21')).toBe('2026-08-21');
    expect(rowSortKey_('')).toBe('9999-12-31');
    expect(rowSortKey_(null)).toBe('9999-12-31');
    expect(rowSortKey_('not a date')).toBe('9999-12-31');
  });

  it('sorts a real sheet body and leaves an already-sorted one alone', () => {
    const HEADERS = ['_eventId', 'Date', 'Book', 'Type', 'Event/Num', 'Store/Chan', 'Qty',
      'Currency', 'Price/Rate', 'Total/Amount', 'CAD Equivalent', 'Status', 'Notes', 'Invoice'];
    const COL = HEADERS.reduce((m, h, i) => (m[h] = i + 1, m), {});

    const makeSheet = (dates) => {
      const body = dates.map((d, i) => {
        const row = new Array(HEADERS.length).fill('');
        row[COL.Date - 1] = d;
        row[COL['Event/Num'] - 1] = `#${i}`;
        return row;
      });
      let written = null;
      return {
        body,
        get written() { return written; },
        getLastRow: () => body.length + 1,
        getLastColumn: () => HEADERS.length,
        getRange: (row, col, numRows) => ({
          getValue: () => (row === 1 && col === 1 ? '_eventId' : ''),
          getValues: () => body.slice(row - 2, row - 2 + numRows),
          setValues: (v) => { written = v; },
        }),
      };
    };

    const sortSheetByDate_ = new Function('Utilities', 'Session', 'HEADERS', 'COL', `
      ${extract('rowSortKey_')}
      ${extract('sortSheetByDate_')}
      return sortSheetByDate_;
    `)(
      { formatDate: (d) => d.toISOString().slice(0, 10) },
      { getScriptTimeZone: () => 'UTC' },
      HEADERS, COL
    );

    // The shape the publisher reported: September delivered before July.
    const jumbled = makeSheet(['2026-09-02', '2026-07-10', '2026-08-21', '2026-08-15']);
    expect(sortSheetByDate_(jumbled)).toBe(true);
    expect(jumbled.written.map(r => r[COL.Date - 1]))
      .toEqual(['2026-07-10', '2026-08-15', '2026-08-21', '2026-09-02']);

    // An already-ordered sheet must not spend a write.
    const ordered = makeSheet(['2026-07-10', '2026-08-15', '2026-09-02']);
    expect(sortSheetByDate_(ordered)).toBe(false);
    expect(ordered.written).toBeNull();
  });

  it('collapses consecutive deletions into single deleteRows runs', () => {
    const deleteRowsBulk_ = new Function(`${extract('deleteRowsBulk_')}\nreturn deleteRowsBulk_;`)();
    const calls = [];
    const sheet = { deleteRows: (start, count) => calls.push([start, count]) };

    // Rows 2..5 plus a detached row 9 — two calls, not five round-trips.
    expect(deleteRowsBulk_(sheet, [3, 2, 5, 4, 9])).toBe(5);
    expect(calls).toEqual([[9, 1], [2, 4]]);

    // Bottom-up, so earlier indices stay valid as rows disappear.
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i][0]).toBeLessThan(calls[i - 1][0]);
    }

    calls.length = 0;
    expect(deleteRowsBulk_(sheet, [])).toBe(0);
    expect(deleteRowsBulk_(null, [2])).toBe(0);
    expect(calls).toEqual([]);
  });

  it('advertises ordered rows so the client can feature-detect the deploy', () => {
    expect(codeGs).toContain('dateOrderedRows: true');
  });
});
