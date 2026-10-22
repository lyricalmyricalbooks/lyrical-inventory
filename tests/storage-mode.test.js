import { describe, it, expect } from 'vitest';
import { adoptDecision, compareCopies, missingFromNew, movedElsewhere, restoreRecords } from '../src/lib/storage-mode.js';

describe('adoptDecision', () => {
  const base = { publisher: true, global: true, flagged: false };

  it('moves a book added after the move to the new storage', () => {
    expect(adoptDecision({ ...base, hasFirestoreData: false })).toBe('adopt');
  });

  it('leaves a book that has a copy in both storages alone', () => {
    expect(adoptDecision({ ...base, hasFirestoreData: true })).toBe('kept');
  });

  it('waits when the new storage could not be checked', () => {
    expect(adoptDecision({ ...base, hasFirestoreData: null })).toBe('unknown');
    expect(adoptDecision({ ...base })).toBe('unknown');
  });

  it('does nothing for books already moved, authors, or before the app moved', () => {
    expect(adoptDecision({ ...base, flagged: true, hasFirestoreData: false })).toBe('skip');
    expect(adoptDecision({ ...base, publisher: false, hasFirestoreData: false })).toBe('skip');
    expect(adoptDecision({ ...base, global: false, hasFirestoreData: false })).toBe('skip');
  });
});

describe('movedElsewhere', () => {
  it('notices another device moved the book', () => {
    expect(movedElsewhere({ global: true, flaggedHere: false, serverFlags: { fs_mode_injured: true }, bookId: 'injured' })).toBe(true);
  });

  it('is false when nothing changed or the flags could not be read', () => {
    expect(movedElsewhere({ global: true, flaggedHere: false, serverFlags: {}, bookId: 'injured' })).toBe(false);
    expect(movedElsewhere({ global: true, flaggedHere: false, serverFlags: null, bookId: 'injured' })).toBe(false);
    expect(movedElsewhere({ global: true, flaggedHere: true, serverFlags: { fs_mode_injured: true }, bookId: 'injured' })).toBe(false);
    expect(movedElsewhere({ global: false, flaggedHere: false, serverFlags: { fs_mode_injured: true }, bookId: 'injured' })).toBe(false);
  });
});

describe('compareCopies', () => {
  const sale = (over = {}) => ({ uid: 'u1', chan: 'Website', qty: 1, price: 20, date: '2026-08-15', ...over });
  const old = { stock: 15, hist: [sale(), sale({ uid: 'u2', qty: 3 })], ledger: [{ id: 'L1', qty: 50 }], doneIds: ['a'] };

  it('a straight copy is identical and complete', () => {
    const r = compareCopies(old, JSON.parse(JSON.stringify(old)));
    expect(r).toMatchObject({ identical: true, ok: true, oldRows: 3, newRows: 3 });
    expect(r.onlyInOld).toEqual([]);
  });

  it('sales recorded or edited since the move are fine; only missing records count', () => {
    const now = { ...old, stock: 14, hist: [sale({ uid: 'u3' }), sale({ shipped: true }), sale({ uid: 'u2', qty: 3 })], doneIds: [] };
    const r = compareCopies(old, now);
    expect(r).toMatchObject({ identical: false, ok: true });
  });

  it('names the records the new copy is missing', () => {
    const r = compareCopies(old, { ...old, hist: [sale()], ledger: [] });
    expect(r.ok).toBe(false);
    expect(r.onlyInOld.map(x => [x.part, x.row.uid || x.row.id])).toEqual([['hist', 'u2'], ['ledger', 'L1']]);
  });

  it('two identical cash sales without an id stay two', () => {
    const cash = { chan: 'Book Fair', qty: 1, price: 20, date: '2026-06-01' };
    const r = compareCopies({ hist: [cash, { ...cash }] }, { hist: [cash] });
    expect(r.onlyInOld).toHaveLength(1);
  });

  it('a change to the book’s own details is not identical, but nothing is missing', () => {
    expect(compareCopies(old, { ...old, stock: 99 })).toMatchObject({ identical: false, ok: true });
  });
});

describe('missingFromNew', () => {
  const sale = (over = {}) => ({ chan: 'Website', qty: 1, price: 20, date: '2026-08-15', ...over });

  it('a sale edited since the move is not shown as missing', () => {
    const old = { hist: [sale({ num: '#1001', notes: '' }), sale({ sheetsId: 'bc-77' })] };
    const now = { hist: [sale({ num: '#1001', notes: 'gift wrap' }), sale({ sheetsId: 'bc-77', price: 18 })] };
    expect(compareCopies(old, now).onlyInOld).toHaveLength(2);
    expect(missingFromNew(old, now)).toEqual([]);
  });

  it('a sale that is gone, or a cash sale with nothing to name it, still shows', () => {
    const cash = sale({ chan: 'Book Fair' });
    const old = { hist: [sale({ num: '#1002' }), cash], ledger: [{ id: 'L1' }] };
    const now = { hist: [{ ...cash, price: 15 }], ledger: [] };
    expect(missingFromNew(old, now).map(m => m.row.num || m.row.id || m.row.chan)).toEqual(['#1002', 'Book Fair', 'L1']);
  });

  it('one edited sale only accounts for one old version', () => {
    const old = { hist: [sale({ num: '#1003' }), sale({ num: '#1003', qty: 2 })] };
    const now = { hist: [sale({ num: '#1003', qty: 3 })] };
    expect(missingFromNew(old, now)).toHaveLength(1);
  });

  it('a sale whose order number moved to another day still shows', () => {
    expect(missingFromNew({ hist: [sale({ num: '#1004' })] }, { hist: [sale({ num: '#1004', date: '2026-08-16' })] })).toHaveLength(1);
  });
});

describe('restoreRecords', () => {
  it('adds only the given records, sales at their date position', () => {
    const state = { hist: [{ uid: 'c', date: '2026-08-20' }, { uid: 'a', date: '2026-06-01' }], ledger: [] };
    const added = restoreRecords(state, [
      { part: 'hist', row: { uid: 'b', date: '2026-07-01' } },
      { part: 'ledger', row: { id: 'L1' } },
    ]);
    expect(added).toBe(2);
    expect(state.hist.map(h => h.uid)).toEqual(['c', 'b', 'a']);
    expect(state.ledger).toEqual([{ id: 'L1' }]);
  });
});
