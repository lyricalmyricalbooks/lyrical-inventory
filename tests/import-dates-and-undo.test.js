import { beforeAll, describe, expect, it, vi } from 'vitest';
import { classifyImportRows, importBatches, importDateIssues, latestImport, parseImportDate } from '../src/lib/import-batch.js';
import { loadApp, makeBook } from './helpers/load-app.js';

const todayStr = '2026-10-27';

describe('parseImportDate', () => {
  it('reads ISO dates exactly', () => {
    expect(parseImportDate('2025-03-04', { todayStr })).toEqual({ date: '2025-03-04', issue: null });
    expect(parseImportDate('2025/3/4', { todayStr })).toEqual({ date: '2025-03-04', issue: null });
  });

  it('flags a date that reads two ways, and follows the chosen order', () => {
    expect(parseImportDate('03/04/2025', { todayStr })).toEqual({ date: '2025-03-04', issue: 'ambiguous' });
    expect(parseImportDate('03/04/2025', { todayStr, order: 'dmy' })).toEqual({ date: '2025-04-03', issue: 'ambiguous' });
  });

  it('needs no flag when only one reading is a real date', () => {
    expect(parseImportDate('25/12/2025', { todayStr })).toEqual({ date: '2025-12-25', issue: null });
    expect(parseImportDate('12/25/2025', { todayStr, order: 'dmy' })).toEqual({ date: '2025-12-25', issue: null });
  });

  it('flags a two-digit year, since it could be read as a day', () => {
    expect(parseImportDate('04/04/25', { todayStr })).toEqual({ date: '2025-04-04', issue: 'shortYear' });
  });

  it('reads written-out months', () => {
    expect(parseImportDate('Oct 3, 2025', { todayStr })).toEqual({ date: '2025-10-03', issue: null });
  });

  it('says so when it falls back to today', () => {
    expect(parseImportDate('sometime in spring', { todayStr })).toEqual({ date: todayStr, issue: 'unreadable' });
    expect(parseImportDate('31/31/2025', { todayStr })).toEqual({ date: todayStr, issue: 'unreadable' });
    expect(parseImportDate('', { todayStr })).toEqual({ date: todayStr, issue: 'missing' });
    expect(parseImportDate(45000, { todayStr })).toEqual({ date: todayStr, issue: 'unreadable' });
  });

  it('uses the spreadsheet reader for date numbers', () => {
    expect(parseImportDate(45000, { todayStr, excelSerial: () => '2023-03-15' })).toEqual({ date: '2023-03-15', issue: null });
  });

  it('counts what needs a look', () => {
    expect(importDateIssues([{ dateIssue: 'ambiguous' }, { dateIssue: null }, { dateIssue: 'missing' }, { dateIssue: 'unreadable' }]))
      .toEqual({ ambiguous: 1, unreadable: 1, missing: 1, shortYear: 0 });
  });
});

describe('latestImport', () => {
  it('is the newest import that still has rows counting', () => {
    const hist = [
      { importId: 'b', importedAt: '2026-10-20T00:00:00Z', importName: 'b.csv' },
      { importId: 'a', importedAt: '2026-10-01T00:00:00Z' },
      { importId: 'c', importedAt: '2026-10-25T00:00:00Z', voided: true },
      { num: 'M-1' },
    ];
    expect(latestImport(hist)).toEqual({ id: 'b', at: '2026-10-20T00:00:00Z', name: 'b.csv', count: 1, refunds: 0 });
    expect(latestImport([{ num: 'x' }])).toBeNull();
  });

  it('lists every import still counting, newest first', () => {
    const hist = [
      { importId: 'a', importedAt: '2026-10-01T00:00:00Z' },
      { importId: 'b', importedAt: '2026-10-20T00:00:00Z' },
      { importId: 'a', importedAt: '2026-10-01T00:00:00Z' },
      { importId: 'c', importedAt: '2026-10-25T00:00:00Z', voided: true },
    ];
    expect(importBatches(hist).map(b => [b.id, b.count])).toEqual([['b', 1], ['a', 2]]);
  });

  it('keeps an import of only refunds undoable', () => {
    const hist = [
      { num: '1001', voided: true, refundedByImport: 'r', refundedByImportAt: '2026-11-01T00:00:00Z', refundedByImportName: 'refunds.csv' },
      { importId: 'a', importedAt: '2026-10-01T00:00:00Z' },
    ];
    expect(importBatches(hist).map(b => [b.id, b.count, b.refunds, b.name])).toEqual([['r', 0, 1, 'refunds.csv'], ['a', 1, 0, '']]);
  });
});

describe('classifyImportRows', () => {
  it('marks rows already in the book and repeats, keeping the last repeat as the new one', () => {
    const rows = [{ num: 'A' }, { num: 'B' }, { num: 'C' }, { num: 'B' }];
    const hist = [{ num: 'A' }, { num: 'C', voided: true }];
    expect(classifyImportRows(rows, hist)).toEqual({ fresh: 2, inBook: 1, repeat: 1 });
    expect(rows.map(r => r.status)).toEqual(['inBook', 'repeat', 'new', 'new']);
  });
});

describe('importing a file, then undoing it', () => {
  let app;
  const st = () => app.main.states.bk;

  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'bk', title: 'Harbour Lights' })] });
    await app.resetBook('bk', {});
    app.window.switchBook('bk');
  }, 30000);

  it('flags guessed dates in the preview and lets the owner say the file is day-first', async () => {
    const csv = 'Order #,Date,Channel,Qty,Unit price,Notes\nA-1,03/04/2025,Website,2,40,\nA-2,someday,Book Fair,1,40,\nA-3,2025-05-01,Website,1,40,\n';
    await app.window.handleImportFile({ target: { files: [new File([csv], 'old-orders.csv', { type: 'text/csv' })], value: '' } });
    await vi.waitFor(() => {
      expect(document.getElementById('import-summary').textContent).toContain('3 orders');
    }, { timeout: 3000, interval: 10 });
    const summary = document.getElementById('import-summary').textContent;
    expect(summary).toMatch(/1 date like 03\/04 could be read two ways/);
    expect(summary).toMatch(/1 date couldn’t be read and will go in as today/);
    expect(document.querySelectorAll('#import-preview-body .pill.amber')).toHaveLength(2);

    app.window.setImportDateOrder('dmy');
    app.window.confirmImport();
    const a1 = st().hist.find(h => h.num === 'A-1');
    expect(a1.date).toBe('2025-04-03');
    expect(a1.importId).toMatch(/^imp-/);
    expect(a1.importName).toBe('old-orders.csv');
    expect(new Set(st().hist.filter(h => h.importId).map(h => h.importId)).size).toBe(1);
    expect(st().sold).toBe(4);
  });

  it('offers the undo at the top of History and reverses the whole import', async () => {
    app.window.renderHist();
    const notice = document.getElementById('hist-import-notice');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toMatch(/Imported 3 orders from “old-orders.csv”/);

    const id = st().hist.find(h => h.num === 'A-1').importId;
    const undoing = app.window.undoImport(id);
    await app.answerConfirm(true); // the app's own dialog, not the browser's
    await undoing;

    expect(st().hist.filter(h => h.importId === id).every(h => h.voided)).toBe(true);
    expect(st().sold).toBe(0);
    expect(st().revenue).toBe(0);
    expect(document.getElementById('hist-import-notice').hidden).toBe(true);
  });
  async function importCsv(csv, name = 'again.csv') {
    document.getElementById('import-summary').textContent = '';
    await app.window.handleImportFile({ target: { files: [new File([csv], name, { type: 'text/csv' })], value: '' } });
    await vi.waitFor(() => {
      expect(document.getElementById('import-summary').textContent).toMatch(/Found \d+ orders/);
    }, { timeout: 3000, interval: 10 });
  }

  it('brings the rows back when the same file is imported again after an undo', async () => {
    const csv = 'Order #,Date,Channel,Qty,Unit price,Notes\nA-1,03/04/2025,Website,2,40,\nA-2,someday,Book Fair,1,40,\nA-3,2025-05-01,Website,1,40,\n';
    await importCsv(csv, 'old-orders.csv');
    app.window.confirmImport();
    expect(st().hist.filter(h => !h.voided && /^A-/.test(h.num))).toHaveLength(3);
    expect(st().sold).toBe(4);
  });

  it('gives rows without an order number the same id whichever way dates are read', async () => {
    const csv = 'Order #,Date,Channel,Qty,Unit price,Notes\n,05/06/2025,Book Fair,1,20,\n';
    await importCsv(csv, 'blank.csv');
    app.window.setImportDateOrder('dmy');
    app.window.confirmImport();
    const first = st().hist.filter(h => !h.voided && /^IMP-/.test(h.num));
    expect(first).toHaveLength(1);

    await importCsv(csv, 'blank.csv');
    app.window.setImportDateOrder('mdy');
    app.window.confirmImport();
    expect(st().hist.filter(h => !h.voided && /^IMP-/.test(h.num))).toHaveLength(1);
  });

  it('keeps rows matched to a website order when undoing', async () => {
    const csv = 'Order #,Date,Channel,Qty,Unit price,Notes\nW-1,2025-07-01,Website,1,30,\nW-2,2025-07-02,Website,1,30,\n';
    await importCsv(csv, 'web.csv');
    app.window.confirmImport();
    const w1 = st().hist.find(h => h.num === 'W-1');
    w1.webOrderId = 'order-77';
    const undoing = app.window.undoImport(w1.importId);
    await app.answerConfirm(true);
    await undoing;
    expect(st().hist.find(h => h.num === 'W-1').voided).toBeFalsy();
    expect(st().hist.find(h => h.num === 'W-2').voided).toBe(true);
  });

  it('says before importing which rows are already in the book', async () => {
    const csv = 'Order #,Date,Channel,Qty,Unit price,Notes\nW-1,2025-07-01,Website,1,30,\nN-1,2025-08-01,Website,1,30,\n';
    await importCsv(csv, 'mixed.csv');
    const summary = document.getElementById('import-summary').textContent;
    expect(summary).toMatch(/1 is already in this book/);
    expect(summary).toMatch(/1 new will be added/);
    expect(document.getElementById('import-count').textContent).toBe('1');
    const pills = [...document.querySelectorAll('#import-preview-body .pill')].map(p => p.textContent);
    expect(pills).toEqual(['Already in book', 'New']);
  });

  it('remembers how dates are written for the next file', async () => {
    app.window.setImportDateOrder('dmy');
    const csv = 'Order #,Date,Channel,Qty,Unit price,Notes\nD-1,03/04/2025,Website,1,30,\n';
    await importCsv(csv, 'day-first.csv');
    expect(document.querySelector('#import-summary select').value).toBe('dmy');
    app.window.confirmImport();
    expect(st().hist.find(h => h.num === 'D-1').date).toBe('2025-04-03');
    expect(window.localStorage.getItem('lm-import-date-order')).toBe('dmy');
  });

  it('keeps every earlier import undoable from History', async () => {
    app.window.renderHist();
    const host = document.getElementById('hist-import-notice');
    expect(host.querySelector('.hist-import-notice').textContent).toMatch(/from “day-first.csv”/);
    const earlier = host.querySelector('.hist-past-imports');
    expect(earlier.querySelector('summary').textContent).toMatch(/Earlier imports \(\d+\)/);
    expect(earlier.textContent).toMatch(/from “old-orders.csv”/);

    const latestId = st().hist.find(h => h.num === 'D-1').importId;
    app.window.closeImportNotice(latestId);
    const past = document.querySelector('#hist-import-notice .hist-past-imports');
    expect(past.querySelector('summary').textContent).toMatch(/Past imports/);
    expect(past.querySelector(`[data-import="${latestId}"]`)).not.toBeNull();
  });
});
