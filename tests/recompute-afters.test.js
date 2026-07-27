import { describe, it, expect } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import {
  deriveOnHand,
  buildOrderTimeline,
  deduplicateDirectConsignmentSales,
  recalculateBookStatsFromHistory,
} from '../src/lib/inventory.js';

// recomputeAfters is the function every stock and balance figure in the app
// depends on. It runs on every book load, after every sync merge, and before
// every save — and it had no behavioural coverage at all.
//
// Three things rest on it. The header on-hand count. Each history row's stored
// `after`, which is what gets written to the Google Sheet, so an error here
// leaves the sheet disagreeing with the app. And the store counters, which
// decide what a consignment partner is believed to owe.
//
// merge-state.js deliberately excludes `after` from row identity *because*
// this function recomputes it, so the offline-merge path is only correct while
// this is.

const book = { id: 'hound', title: 'The Hound', maxPrint: 100, listPrice: 20, currency: 'CA$' };

const harness = () => buildHarness({
  names: ['reconcileConsignmentChannel', 'reconcileStores', 'recomputeAfters'],
  deps: {
    deriveOnHand,
    buildOrderTimeline,
    deduplicateDirectConsignmentSales,
    recalculateBookStatsFromHistory,
    getBook: () => book,
  },
  returns: 'recomputeAfters',
});

const run = (state) => { const s = JSON.parse(JSON.stringify(state)); harness()(s, book); return s; };

describe('recomputeAfters — stock', () => {
  it('derives on-hand from the print run less what has left', () => {
    const s = run({
      hist: [{ date: '2026-03-01', num: 'A1', qty: 3, price: 20, chan: 'Direct' }],
      ledger: [], stores: [], expenses: [],
    });
    expect(s.stock).toBe(97);
  });

  it('does not count a voided sale against stock', () => {
    const s = run({
      hist: [
        { date: '2026-03-01', num: 'A1', qty: 3, price: 20, chan: 'Direct' },
        { date: '2026-03-02', num: 'A2', qty: 5, price: 20, chan: 'Direct', voided: true },
      ],
      ledger: [], stores: [], expenses: [],
    });
    expect(s.stock).toBe(97);
  });

  it('treats stock shipped to a store as gone from the warehouse', () => {
    const s = run({
      hist: [],
      ledger: [{ id: 1, type: 'Shipment', storeId: 's1', qty: 10, date: '2026-03-01' }],
      stores: [{ id: 's1', name: 'Bookstore A', sent: 0, sold: 0, returned: 0, outstanding: 0 }],
      expenses: [],
    });
    expect(s.stock).toBe(90);
  });

  it('brings returned stock back on hand only once it is restocked', () => {
    // A return in transit or damaged is not back on the shelf, so only a
    // return explicitly marked restocked counts. Both cases are asserted
    // because the difference is one field and it moves the headline figure.
    const ledger = (status) => [
      { id: 1, type: 'Shipment', storeId: 's1', qty: 10, date: '2026-03-01' },
      { id: 2, type: 'Return', storeId: 's1', qty: 4, date: '2026-03-05', ...(status ? { status } : {}) },
    ];
    const stores = [{ id: 's1', name: 'Bookstore A', sent: 0, sold: 0, returned: 0, outstanding: 0 }];

    const pending = run({ hist: [], ledger: ledger(null), stores, expenses: [] });
    expect(pending.stock).toBe(90);

    const restocked = run({ hist: [], ledger: ledger('restocked'), stores, expenses: [] });
    expect(restocked.stock).toBe(94);
  });
});

describe('recomputeAfters — the running balance written to the Sheet', () => {
  it('walks down from the print run in date order', () => {
    const s = run({
      hist: [
        { date: '2026-03-03', num: 'A3', qty: 1, price: 20, chan: 'Direct' },
        { date: '2026-03-02', num: 'A2', qty: 2, price: 20, chan: 'Direct' },
        { date: '2026-03-01', num: 'A1', qty: 3, price: 20, chan: 'Direct' },
      ],
      ledger: [], stores: [], expenses: [],
    });
    const after = Object.fromEntries(s.hist.map(h => [h.num, h.after]));
    // oldest first: 100-3=97, then -2=95, then -1=94
    expect(after).toEqual({ A1: 97, A2: 95, A3: 94 });
  });

  it('stamps every non-voided row with a balance', () => {
    const s = run({
      hist: [
        { date: '2026-03-01', num: 'A1', qty: 1, price: 20, chan: 'Direct' },
        { date: '2026-03-02', num: 'A2', qty: 1, price: 20, chan: 'Direct' },
      ],
      ledger: [], stores: [], expenses: [],
    });
    s.hist.forEach(h => expect(typeof h.after).toBe('number'));
  });

  it('is idempotent — running it twice changes nothing', () => {
    // It runs on load, after a merge and before a save, so a second pass that
    // moved the numbers would make the figures depend on how often it ran.
    const state = {
      hist: [
        { date: '2026-03-01', num: 'A1', qty: 3, price: 20, chan: 'Direct' },
        { date: '2026-03-02', num: 'A2', qty: 2, price: 20, chan: 'Direct' },
      ],
      ledger: [{ id: 1, type: 'Shipment', storeId: 's1', qty: 5, date: '2026-03-03' }],
      stores: [{ id: 's1', name: 'A', sent: 0, sold: 0, returned: 0, outstanding: 0 }],
      expenses: [],
    };
    const once = run(state);
    const twice = JSON.parse(JSON.stringify(once));
    harness()(twice, book);
    expect(twice).toEqual(once);
  });
});

describe('recomputeAfters — store counters', () => {
  it('rebuilds sent/sold/returned from the ledger, repairing drift', () => {
    // The classic symptom: counters nudged per action drift after an offline
    // merge, leaving a phantom outstanding that does not equal sent−sold−returned.
    const s = run({
      hist: [],
      ledger: [
        { id: 1, type: 'Shipment', storeId: 's1', qty: 6, date: '2026-03-01' },
        { id: 2, type: 'Sale', storeId: 's1', qty: 6, date: '2026-03-02' },
      ],
      stores: [{ id: 's1', name: 'A', sent: 99, sold: 0, returned: 0, outstanding: 1 }],
      expenses: [],
    });
    const st = s.stores[0];
    expect(st.sent).toBe(6);
    expect(st.sold).toBe(6);
    expect(st.outstanding).toBe(0);
  });

  it('ignores voided ledger rows when rebuilding', () => {
    const s = run({
      hist: [],
      ledger: [
        { id: 1, type: 'Shipment', storeId: 's1', qty: 10, date: '2026-03-01' },
        { id: 2, type: 'Sale', storeId: 's1', qty: 4, date: '2026-03-02', voided: true },
      ],
      stores: [{ id: 's1', name: 'A', sent: 0, sold: 0, returned: 0, outstanding: 0 }],
      expenses: [],
    });
    expect(s.stores[0].sold).toBe(0);
    expect(s.stores[0].outstanding).toBe(10);
  });

  it('leaves amountOwed alone — payments settle separately', () => {
    const s = run({
      hist: [],
      ledger: [{ id: 1, type: 'Sale', storeId: 's1', qty: 2, date: '2026-03-02' }],
      stores: [{ id: 's1', name: 'A', sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 37.5 }],
      expenses: [],
    });
    expect(s.stores[0].amountOwed).toBe(37.5);
  });
});

describe('recomputeAfters — consignment channel stats', () => {
  it('totals live consignment sales into the channel line', () => {
    const s = run({
      hist: [
        { date: '2026-03-01', num: 'C1', qty: 2, price: 20, chan: 'Consignment' },
        { date: '2026-03-02', num: 'C2', qty: 1, price: 20, chan: 'Consignment' },
      ],
      ledger: [], stores: [], expenses: [],
    });
    expect(s.chStats.Consignment).toEqual({ txns: 2, units: 3, revenue: 60 });
  });

  it('excludes a voided consignment sale from the channel total', () => {
    const s = run({
      hist: [
        { date: '2026-03-01', num: 'C1', qty: 2, price: 20, chan: 'Consignment' },
        { date: '2026-03-02', num: 'C2', qty: 5, price: 20, chan: 'Consignment', voided: true },
      ],
      ledger: [], stores: [], expenses: [],
    });
    expect(s.chStats.Consignment).toEqual({ txns: 1, units: 2, revenue: 40 });
  });

  it('drops a stale all-zero consignment line rather than showing 0 0 $0.00', () => {
    const s = run({
      hist: [], ledger: [], stores: [], expenses: [],
      chStats: { Consignment: { txns: 0, units: 0, revenue: 0 } },
    });
    expect(s.chStats.Consignment).toBeUndefined();
  });
});

describe('recomputeAfters — tolerates malformed state', () => {
  it('does not throw on an empty book', () => {
    expect(() => run({ hist: [], ledger: [], stores: [], expenses: [] })).not.toThrow();
  });

  it('does not throw when hist or ledger are missing entirely', () => {
    expect(() => run({})).not.toThrow();
  });
});

describe('recomputeAfters — consignmentLink is derived, not authored', () => {
  it('stamps the link on a row whose channel is Consignment', () => {
    const s = run({
      hist: [{ date: '2026-03-01', num: 'C1', qty: 1, price: 20, chan: 'Consignment' }],
      ledger: [], stores: [], expenses: [],
    });
    expect(s.hist[0].consignmentLink).toBe(true);
  });

  it('strips a stale link from a row that is no longer a consignment sale', () => {
    // Changing the channel back to Direct has to drop the link, or the row
    // keeps counting toward the consignment channel and stops counting
    // against warehouse stock — wrong in two places at once.
    const s = run({
      hist: [{ date: '2026-03-01', num: 'D1', qty: 1, price: 20, chan: 'Direct', consignmentLink: true }],
      ledger: [], stores: [], expenses: [],
    });
    expect(s.hist[0].consignmentLink).toBeUndefined();
    expect(s.stock).toBe(99);   // counts against stock again
  });

  it('keeps a consignment sale out of the warehouse stock count', () => {
    // The units already left the warehouse on the Shipment row; counting the
    // sale too would double-deduct.
    const s = run({
      hist: [{ date: '2026-03-02', num: 'C1', qty: 3, price: 20, chan: 'Consignment' }],
      ledger: [{ id: 1, type: 'Shipment', storeId: 's1', qty: 5, date: '2026-03-01' }],
      stores: [{ id: 's1', name: 'A', sent: 0, sold: 0, returned: 0, outstanding: 0 }],
      expenses: [],
    });
    expect(s.stock).toBe(95);
  });
});
