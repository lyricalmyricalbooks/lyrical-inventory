import { describe, it, expect } from 'vitest';
import {
  diffSheetRows,
  expenseRowPayload,
  isMoneyOutRow,
  moneyOutSheetRows,
  payoutRowPayload,
  sheetRowFingerprint,
} from '../src/lib/sheet-rows.js';
import { sheetLogLabel, sheetLogSummary } from '../src/lib/sheet-sync.js';

const book = { id: 'zine', title: 'Night Zine', currency: 'CA$' };

describe('expense rows', () => {
  it('describe the expense in the sheet columns, in its own currency', () => {
    const row = expenseRowPayload(book, 'zine', {
      id: 17, desc: 'Risograph master', cat: 'Printing', amount: 120.456, currency: 'USD', baseAmount: 165.1, date: '2026-08-20', ref: 'INV-77',
    });
    expect(row).toMatchObject({
      type: 'expense', book: 'Night Zine', date: '2026-08-20', num: 'INV-77', chan: 'Printing',
      total: 120.46, currency: 'USD', convertedTotal: 165.1, status: 'OK', notes: 'Risograph master',
      sheetsId: 'exp-zine-17',
    });
  });

  it('use the saved rate when there is no saved CAD value, and leave CAD blank when there is neither', () => {
    expect(expenseRowPayload(book, 'zine', { id: 1, amount: 40, currency: 'EUR', fxRate: 1.5 }).convertedTotal).toBe(60);
    // Never 1:1 — the sheet fills a blank the way it does for any other row.
    expect(expenseRowPayload(book, 'zine', { id: 2, amount: 40, currency: 'EUR', fxMissing: true }).convertedTotal).toBe('');
    expect(expenseRowPayload(book, 'zine', { id: 3, amount: 40, currency: 'CAD' }).convertedTotal).toBe(40);
  });

  it('fall back to the book currency for a legacy expense with none', () => {
    expect(expenseRowPayload(book, 'zine', { id: 1, amount: 5 }).currency).toBe('CAD');
    expect(expenseRowPayload({ title: 'Euro book', currency: '€' }, 'eu', { id: 1, amount: 5 }).currency).toBe('EUR');
  });
});

describe('artist payment rows', () => {
  it('use the currency the payment was recorded in', () => {
    const row = payoutRowPayload(book, 'zine', { id: 'evt-p', date: '2026-09-15', amount: 50, method: 'E-transfer', notes: 'September', cur: 'USD', sourceNum: '#12' });
    expect(row).toMatchObject({
      type: 'payout', date: '2026-09-15', num: '#12', chan: 'E-transfer', total: 50, currency: 'USD',
      convertedTotal: '', notes: 'September', sheetsId: 'payout-zine-evt-p',
    });
    expect(payoutRowPayload(book, 'zine', { id: 2, amount: 50 }).convertedTotal).toBe(50);
  });
});

describe('moneyOutSheetRows', () => {
  it('lists every live expense and payout, and nothing voided, pending or unidentifiable', () => {
    const rows = moneyOutSheetRows(book, 'zine', {
      expenses: [
        { id: 1, amount: 5, currency: 'CAD' },
        { id: 2, amount: 5, currency: 'CAD', voided: true },
        { id: 3, amount: 5, currency: 'CAD', pendingAuth: true },
        { amount: 5, currency: 'CAD' },
      ],
      artistPayouts: [{ id: 'a', amount: 9 }, { id: 'b', amount: 9, voided: true }],
    });
    expect(rows.map(r => r.sheetsId)).toEqual(['exp-zine-1', 'payout-zine-a']);
    expect(rows.every(isMoneyOutRow)).toBe(true);
    expect(isMoneyOutRow({ type: 'order' })).toBe(false);
  });

  it('keeps two records that happen to share an id as two rows', () => {
    const rows = moneyOutSheetRows(book, 'zine', { expenses: [{ id: 5, amount: 1 }, { id: 5, amount: 2 }] });
    expect(rows.map(r => r.sheetsId)).toEqual(['exp-zine-5', 'exp-zine-5~2']);
  });

  it('copes with a book that has neither list', () => {
    expect(moneyOutSheetRows(book, 'zine', {})).toEqual([]);
    expect(moneyOutSheetRows(book, 'zine', null)).toEqual([]);
  });

  it('scopes ids to the book, so a moved expense is a removal and an addition', () => {
    const e = { id: 9, amount: 5, currency: 'CAD' };
    const before = diffSheetRows({}, moneyOutSheetRows(book, 'zine', { expenses: [e] })).next;
    expect(diffSheetRows(before, moneyOutSheetRows(book, 'zine', { expenses: [] })).removed).toEqual(['exp-zine-9']);
    expect(moneyOutSheetRows({ title: 'Other' }, 'other', { expenses: [e] })[0].sheetsId).toBe('exp-other-9');
  });
});

describe('diffSheetRows', () => {
  const rowA = expenseRowPayload(book, 'zine', { id: 1, desc: 'A', amount: 5, currency: 'CAD', date: '2026-01-01' });
  const rowB = expenseRowPayload(book, 'zine', { id: 2, desc: 'B', amount: 7, currency: 'CAD', date: '2026-01-02' });

  it('sends everything the first time', () => {
    const d = diffSheetRows(undefined, [rowA, rowB]);
    expect(d.changed).toEqual([rowA, rowB]);
    expect(d.removed).toEqual([]);
  });

  it('sends nothing when nothing changed, the changed row when one did, and names what went', () => {
    const sent = diffSheetRows({}, [rowA, rowB]).next;
    expect(diffSheetRows(sent, [rowA, rowB])).toMatchObject({ changed: [], removed: [] });
    const edited = { ...rowB, total: 8 };
    expect(diffSheetRows(sent, [rowA, edited]).changed).toEqual([edited]);
    expect(diffSheetRows(sent, [rowA]).removed).toEqual([rowB.sheetsId]);
  });

  it('ignores fields that never reach a cell', () => {
    expect(sheetRowFingerprint({ ...rowA, bookColor: '#fff', stockAfter: 3 })).toBe(sheetRowFingerprint(rowA));
    expect(sheetRowFingerprint({ ...rowA, notes: 'changed' })).not.toBe(sheetRowFingerprint(rowA));
  });
});

describe('sync log wording for the new rows', () => {
  it('names expenses and artist payments for what they are', () => {
    const exp = expenseRowPayload(book, 'zine', { id: 1, cat: 'Printing', amount: 120, currency: 'CAD' });
    expect(sheetLogLabel(exp)).toBe('Expense');
    expect(sheetLogSummary(exp)).toBe('Printing · 120 CAD');
    expect(sheetLogSummary({ action: 'delete', type: 'expense', sheetsId: 'exp-zine-1' })).toBe('Expense · remove row');
    const pay = payoutRowPayload(book, 'zine', { id: 1, amount: 50, method: 'E-transfer', cur: 'CAD' });
    expect(sheetLogLabel(pay)).toBe('Artist payment');
    expect(sheetLogSummary(pay)).toBe('E-transfer · 50 CAD');
  });
});

describe('titles that would share a Google Sheet tab', () => {
  it('collide when they differ only by case or characters a tab name drops', async () => {
    const { sheetTabKey } = await import('../src/lib/sheet-sync.js');
    expect(sheetTabKey('Night Zine')).toBe(sheetTabKey('night zine'));
    expect(sheetTabKey('Book: One')).toBe(sheetTabKey('Book One'));
    expect(sheetTabKey('Night Zine')).not.toBe(sheetTabKey('Night Zine (2nd ed.)'));
    expect(sheetTabKey('')).toBe('overview');
  });

  it('the book form refuses a second book with the same title', async () => {
    const { appSource } = await import('./helpers/extract-decl.js');
    const save = appSource.match(/async function saveBookFromModal\(\)[\s\S]+?\n\}/)[0];
    expect(save).toContain('sheetTabKey(b.title) === titleKey');
    expect(save.indexOf('titleTwin')).toBeLessThan(save.indexOf('BOOKS[id] = book;'));
    expect(save).toContain('queueSheetsRename(previousTitle, book.title');
  });

  it('a rename reads as one in the sync log', () => {
    expect(sheetLogLabel({ action: 'renamebook', type: 'control' })).toBe('Rename');
    expect(sheetLogSummary({ action: 'renamebook', type: 'control', from: 'Old', to: 'New' })).toBe('“Old” → “New”');
  });
});
