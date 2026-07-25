import { describe, it, expect } from 'vitest';
import {
  LIST_PARTS,
  stableStringify,
  keyRows,
  mergeRows,
  mergeMetadata,
  mergePart,
  splitState,
  stitchState,
} from '../src/lib/merge-state.js';

const sale = (num, over = {}) => ({
  num, chan: 'Direct', qty: 1, price: 20, after: 0, notes: '', date: '2026-07-20', ...over,
});

describe('stableStringify', () => {
  it('ignores key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });
  it('is order-sensitive for arrays', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
  it('handles null and nested objects', () => {
    expect(stableStringify({ a: null, b: { d: 1, c: 2 } }))
      .toBe('{"a":null,"b":{"c":2,"d":1}}');
  });
});

describe('keyRows multiset identity', () => {
  it('gives two content-identical hist rows distinct keys', () => {
    const rows = [sale(null), sale(null)];
    const keys = keyRows('hist', rows);
    expect(keys[0]).not.toBe(keys[1]);
    expect(new Set(keys).size).toBe(2);
  });

  it('prefers uid when present', () => {
    const keys = keyRows('hist', [sale(1, { uid: 'x' }), sale(2, { uid: 'y' })]);
    expect(keys).toEqual(['uid:x', 'uid:y']);
  });

  it('keys id-bearing parts by id', () => {
    expect(keyRows('ledger', [{ id: 7 }, { id: 8 }])).toEqual(['id:7', 'id:8']);
  });

  it('ignores the recomputed `after` column when identifying hist rows', () => {
    const a = keyRows('hist', [sale(1, { after: 10 })]);
    const b = keyRows('hist', [sale(1, { after: 99 })]);
    expect(a).toEqual(b);
  });
});

describe('mergeRows — the offline data-loss case', () => {
  it('keeps sales recorded independently on two devices', () => {
    const base = [sale(1)];
    const local = [sale(3), sale(1)];   // phone at the fair (hist is newest-first)
    const remote = [sale(2), sale(1)];  // laptop at home, synced first

    const { rows, conflicts } = mergeRows('hist', base, remote, local);
    const nums = rows.map(r => r.num).sort();

    expect(nums).toEqual([1, 2, 3]);
    expect(conflicts).toEqual([]);
  });

  it('does not resurrect a row deleted on the other device', () => {
    const base = [sale(1), sale(2)];
    const local = [sale(1), sale(2)];
    const remote = [sale(1)];           // 2 deleted remotely
    const { rows } = mergeRows('hist', base, remote, local);
    expect(rows.map(r => r.num)).toEqual([1]);
  });

  it('does not resurrect a row deleted locally', () => {
    const base = [sale(1), sale(2)];
    const local = [sale(1)];            // 2 deleted here
    const remote = [sale(1), sale(2)];
    const { rows } = mergeRows('hist', base, remote, local);
    expect(rows.map(r => r.num)).toEqual([1]);
  });

  it('preserves duplicate identical sales rather than collapsing them', () => {
    const base = [];
    const local = [sale(null), sale(null)];  // two walk-up cash sales, no order no.
    const remote = [];
    const { rows } = mergeRows('hist', base, remote, local);
    expect(rows).toHaveLength(2);
  });

  it('adds a remote duplicate on top of local duplicates', () => {
    const base = [sale(null)];
    const local = [sale(null), sale(null)];  // one more here
    const remote = [sale(null), sale(null)]; // one more there
    const { rows } = mergeRows('hist', base, remote, local);
    expect(rows).toHaveLength(3);
  });

  it('takes the remote edit when only remote changed', () => {
    const base = [sale(1, { uid: 'a', notes: '' })];
    const local = [sale(1, { uid: 'a', notes: '' })];
    const remote = [sale(1, { uid: 'a', notes: 'refunded' })];
    const { rows, conflicts } = mergeRows('hist', base, remote, local);
    expect(rows[0].notes).toBe('refunded');
    expect(conflicts).toEqual([]);
  });

  it('keeps the local edit when only local changed', () => {
    const base = [sale(1, { uid: 'a', notes: '' })];
    const local = [sale(1, { uid: 'a', notes: 'signed copy' })];
    const remote = [sale(1, { uid: 'a', notes: '' })];
    const { rows, conflicts } = mergeRows('hist', base, remote, local);
    expect(rows[0].notes).toBe('signed copy');
    expect(conflicts).toEqual([]);
  });

  it('reports a conflict when both devices edited the same row', () => {
    const base = [sale(1, { uid: 'a', price: 20 })];
    const local = [sale(1, { uid: 'a', price: 25 })];
    const remote = [sale(1, { uid: 'a', price: 30 })];
    const { rows, conflicts } = mergeRows('hist', base, remote, local);
    expect(rows[0].price).toBe(25);     // local wins, deliberately
    expect(conflicts).toHaveLength(1);  // but it is surfaced, not silent
    expect(conflicts[0].remote.price).toBe(30);
  });

  it('inserts a remote hist row at its date position, newest first', () => {
    const base = [sale(1, { date: '2026-07-10' })];
    const local = [sale(3, { date: '2026-07-20' }), sale(1, { date: '2026-07-10' })];
    const remote = [sale(2, { date: '2026-07-15' }), sale(1, { date: '2026-07-10' })];
    const { rows } = mergeRows('hist', base, remote, local);
    expect(rows.map(r => r.date)).toEqual(['2026-07-20', '2026-07-15', '2026-07-10']);
  });
});

describe('mergeRows — id-keyed parts', () => {
  it('merges ledger rows added on both sides', () => {
    const base = [{ id: 1, type: 'Shipment' }];
    const local = [{ id: 1, type: 'Shipment' }, { id: 2, type: 'Sale' }];
    const remote = [{ id: 1, type: 'Shipment' }, { id: 3, type: 'Return' }];
    const { rows } = mergeRows('ledger', base, remote, local);
    expect(rows.map(r => r.id).sort()).toEqual([1, 2, 3]);
  });

  it('matches ledger rows by id even when other fields differ', () => {
    const base = [{ id: 1, paid: 'n' }];
    const local = [{ id: 1, paid: 'n' }];
    const remote = [{ id: 1, paid: 'y' }];
    const { rows } = mergeRows('ledger', base, remote, local);
    expect(rows).toHaveLength(1);
    expect(rows[0].paid).toBe('y');
  });
});

describe('mergeRows — doneIds', () => {
  it('unions ids applied on both devices', () => {
    const { rows } = mergeRows('doneIds', ['a'], ['a', 'b'], ['a', 'c']);
    expect(rows.sort()).toEqual(['a', 'b', 'c']);
  });

  it('honours an id un-applied on the other device', () => {
    // doneIds is filtered when an order is un-applied (main.js:6049), so a
    // plain union would silently re-apply it.
    const { rows } = mergeRows('doneIds', ['a', 'b'], ['a'], ['a', 'b']);
    expect(rows).toEqual(['a']);
  });
});

describe('mergeMetadata', () => {
  it('takes the highest invoiceSeq so neither device reuses a number', () => {
    const { value } = mergeMetadata({ invoiceSeq: 4 }, { invoiceSeq: 6 }, { invoiceSeq: 5 });
    expect(value.invoiceSeq).toBe(6);
  });

  it('carries local derived fields through for recomputation', () => {
    const { value } = mergeMetadata({ stock: 10 }, { stock: 8 }, { stock: 9 });
    expect(value.stock).toBe(9);
  });

  it('merges invoices by id instead of replacing the array', () => {
    const base = { invoices: [{ id: 1 }] };
    const local = { invoices: [{ id: 1 }, { id: 2 }] };
    const remote = { invoices: [{ id: 1 }, { id: 3 }] };
    const { value } = mergeMetadata(base, remote, local);
    expect(value.invoices.map(i => i.id).sort()).toEqual([1, 2, 3]);
  });

  it('keeps a field added on only one side', () => {
    const { value } = mergeMetadata({}, {}, { artistPaymentLink: 'https://x' });
    expect(value.artistPaymentLink).toBe('https://x');
  });

  it('drops a field deleted on one side when the other left it at base', () => {
    const { value } = mergeMetadata({ note: 'x' }, {}, { note: 'x' });
    expect(Object.prototype.hasOwnProperty.call(value, 'note')).toBe(false);
  });

  it('reports a conflict when both sides set a scalar differently', () => {
    const { value, conflicts } = mergeMetadata(
      { artistPaymentLink: '' },
      { artistPaymentLink: 'https://remote' },
      { artistPaymentLink: 'https://local' },
    );
    expect(value.artistPaymentLink).toBe('https://local');
    expect(conflicts).toHaveLength(1);
  });
});

describe('splitState / stitchState', () => {
  const state = {
    stock: 5, sold: 2, revenue: 40, chStats: {}, invoiceSeq: 3,
    hist: [sale(1)], ledger: [{ id: 1 }], expenses: [], stores: [],
    artistTransfers: [], artistPayouts: [], doneIds: ['a'],
    invoices: [], artistPaymentLink: '',
  };

  it('round-trips a state object unchanged', () => {
    expect(stitchState(splitState(state))).toEqual(state);
  });

  it('round-trips byte-identically, so part hashes stay comparable', () => {
    const once = JSON.stringify(stitchState(splitState(state)));
    const twice = JSON.stringify(stitchState(splitState(JSON.parse(once))));
    expect(once).toBe(twice);
  });

  it('puts every list part in its own slot and the rest in metadata', () => {
    const parts = splitState(state);
    expect(Object.keys(parts).sort()).toEqual([...LIST_PARTS, 'metadata'].sort());
    expect(parts.metadata.hist).toBeUndefined();
    expect(parts.metadata.stock).toBe(5);
  });

  it('defaults missing list parts to empty arrays rather than dropping them', () => {
    const parts = splitState({ stock: 1 });
    LIST_PARTS.forEach(p => expect(parts[p]).toEqual([]));
    expect(stitchState(parts).stock).toBe(1);
  });

  it('tolerates null/garbage input', () => {
    expect(() => splitState(null)).not.toThrow();
    expect(() => stitchState(null)).not.toThrow();
    expect(stitchState(splitState(null)).hist).toEqual([]);
  });
});

describe('mergePart dispatch', () => {
  it('routes metadata to the object merge', () => {
    const { value } = mergePart('metadata', { a: 1 }, { a: 1 }, { a: 1, b: 2 });
    expect(value).toEqual({ a: 1, b: 2 });
  });

  it('routes list parts to the row merge and tolerates non-arrays', () => {
    const { value } = mergePart('hist', null, undefined, [sale(1)]);
    expect(value.map(r => r.num)).toEqual([1]);
  });

  it('is a no-op when all three sides agree', () => {
    const rows = [sale(1), sale(2)];
    const { value, conflicts } = mergePart('hist', rows, rows, rows);
    expect(value).toEqual(rows);
    expect(conflicts).toEqual([]);
  });
});
