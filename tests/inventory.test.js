import { describe, it, expect } from 'vitest';
import { deriveOnHand, buildOrderTimeline, inventoryBreakdown, deduplicateDirectConsignmentSales, recalculateBookStatsFromHistory } from '../src/lib/inventory.js';

const book = (maxPrint = 100) => ({ maxPrint });
const sale = (qty, extra = {}) => ({ qty, ...extra });
const ship = (qty, extra = {}) => ({ type: 'Shipment', qty, ...extra });
const ret = (qty, status, extra = {}) => ({ type: 'Return', qty, status, ...extra });
const state = ({ stock = 0, hist = [], ledger = [] } = {}) => ({ stock, hist, ledger });

describe('deriveOnHand', () => {
  it('returns the full print run when nothing has happened', () => {
    expect(deriveOnHand(state(), book(100))).toBe(100);
  });

  it('subtracts direct sales recorded in history', () => {
    const s = state({ hist: [sale(3), sale(2)] });
    expect(deriveOnHand(s, book(100))).toBe(95);
  });

  it('ignores voided history entries', () => {
    const s = state({ hist: [sale(3), sale(2, { voided: true })] });
    expect(deriveOnHand(s, book(100))).toBe(97);
  });

  it('excludes consignment-sale mirrors (already left as a Shipment)', () => {
    // The Shipment removed the 4 copies; the consignmentLink sale must not
    // subtract them a second time.
    const s = state({
      hist: [sale(2, { consignmentLink: true })],
      ledger: [ship(4)],
    });
    expect(deriveOnHand(s, book(100))).toBe(96);
  });

  it('subtracts books out on consignment (shipments)', () => {
    const s = state({ ledger: [ship(4), ship(6)] });
    expect(deriveOnHand(s, book(100))).toBe(90);
  });

  it('ignores voided shipments', () => {
    const s = state({ ledger: [ship(4), ship(6, { voided: true })] });
    expect(deriveOnHand(s, book(100))).toBe(96);
  });

  it('adds back good (restocked) returns but not written-off ones', () => {
    const s = state({
      ledger: [ship(10), ret(3, 'restocked'), ret(2, 'written off')],
    });
    // 100 − 10 shipped + 3 restocked (written-off copies stay gone) = 93
    expect(deriveOnHand(s, book(100))).toBe(93);
  });

  it('combines direct sales, consignment movement, and returns', () => {
    const s = state({
      hist: [sale(5), sale(2, { consignmentLink: true }), sale(1, { voided: true })],
      ledger: [ship(8), ret(2, 'restocked')],
    });
    // 100 − 5 direct − 8 shipped + 2 restocked = 89 (consignment sale + void excluded)
    expect(deriveOnHand(s, book(100))).toBe(89);
  });

  it('never returns a negative count', () => {
    const s = state({ hist: [sale(150)] });
    expect(deriveOnHand(s, book(100))).toBe(0);
  });

  it('falls back to stored stock when maxPrint is not a finite baseline', () => {
    const s = state({ stock: 42, hist: [sale(2)] });
    expect(deriveOnHand(s, {})).toBe(42);
  });
});

const dsale = (qty, date, extra = {}) => ({ qty, date, ...extra });
const dship = (qty, date, extra = {}) => ({ type: 'Shipment', qty, date, ...extra });
const dret = (qty, date, status, extra = {}) => ({ type: 'Return', qty, date, status, ...extra });

describe('buildOrderTimeline', () => {
  it('returns an empty timeline for an empty book', () => {
    expect(buildOrderTimeline(state(), book(100))).toEqual([]);
  });

  it('walks Stock After from the print run down to the records-true on-hand', () => {
    // Mixed direct sales + consignment, recorded out of date order on purpose.
    const s = state({
      hist: [
        dsale(1, '2026-01-05'),
        dsale(1, '2026-01-04', { consignmentLink: true }), // sold at store — no on-hand change
        dsale(1, '2026-01-03'),
      ],
      ledger: [
        dship(2, '2026-01-02'),
        dret(1, '2026-01-06', 'restocked'),
      ],
    });
    const tl = buildOrderTimeline(s, book(10));

    // Newest first, strictly by date.
    const dates = tl.map(r => r.type === 'consign' ? r.e.date : r.h.date);
    expect(dates).toEqual(['2026-01-06', '2026-01-05', '2026-01-04', '2026-01-03', '2026-01-02']);

    // The newest row reconciles to deriveOnHand; the oldest reflects the first
    // movement off the full print run (10 − 2 shipped = 8).
    expect(tl[0]._after).toBe(deriveOnHand(s, book(10))); // 10 −2 direct −2 shipped +1 restocked = 7
    expect(tl[0]._after).toBe(7);
    expect(tl[tl.length - 1]._after).toBe(8);

    // A consignment SALE doesn't move on-hand (already left as a shipment).
    const consignSaleRow = tl.find(r => r.type === 'hist' && r.h.consignmentLink);
    const beforeIt = tl[tl.indexOf(consignSaleRow) + 1]; // next-older row
    expect(consignSaleRow._after).toBe(beforeIt._after);
  });

  it('keeps Stock After consistent step-by-step with each row delta', () => {
    const s = state({
      hist: [dsale(2, '2026-02-03'), dsale(3, '2026-02-01')],
      ledger: [dship(4, '2026-02-02')],
    });
    const tl = buildOrderTimeline(s, book(20)); // 20 −5 direct −4 shipped = 11
    // Read oldest→newest: each step subtracts that row's books leaving.
    expect(tl.map(r => r._after)).toEqual([11, 13, 17]); // newest→oldest: 11, 13(+2 sale), 17(+4 ship)
    expect(tl[0]._after).toBe(deriveOnHand(s, book(20)));
  });

  it('excludes voided rows from the running balance', () => {
    const s = state({
      hist: [dsale(1, '2026-03-02'), dsale(5, '2026-03-01', { voided: true })],
      ledger: [],
    });
    const tl = buildOrderTimeline(s, book(10));
    expect(tl[0]._after).toBe(9); // only the live sale counts
    expect(tl[0]._after).toBe(deriveOnHand(s, book(10)));
  });
});

describe('inventoryBreakdown', () => {
  it('accounts for every printed copy (buckets sum to printed)', () => {
    const s = state({
      hist: [sale(10), sale(5), sale(6, { consignmentLink: true }), sale(3, { voided: true })],
      ledger: [ship(20), ret(4, 'restocked'), ret(2, 'written off')],
    });
    const bd = inventoryBreakdown(s, book(100));
    expect(bd).toEqual({
      printed: 100,
      onHand: 69,        // 100 − 15 direct − 20 shipped + 4 restocked
      directSold: 15,
      consignSold: 6,
      gratuities: 0,
      onConsignment: 8,  // 20 shipped − 6 sold at store − 4 restocked − 2 written off
      writtenOff: 2,
      unaccounted: 0,    // 69 + 15 + 6 + 0 + 8 + 2 = 100
    });
    expect(bd.onHand).toBe(deriveOnHand(s, book(100)));
  });

  it('accounts for gratuities separately from direct sales', () => {
    const s = state({
      hist: [sale(10), sale(3, { gratuity: true })],
    });
    const bd = inventoryBreakdown(s, book(100));
    expect(bd).toEqual({
      printed: 100,
      onHand: 87,
      directSold: 10,
      consignSold: 0,
      gratuities: 3,
      onConsignment: 0,
      writtenOff: 0,
      unaccounted: 0,
    });
  });

  it('flags an unaccounted gap when the baseline cannot explain the records', () => {
    const s = state({ hist: [sale(15)] });
    const bd = inventoryBreakdown(s, book(10)); // can't sell 15 of 10 printed
    expect(bd.onHand).toBe(0);          // clamped
    expect(bd.directSold).toBe(15);
    expect(bd.gratuities).toBe(0);
    expect(bd.unaccounted).toBe(-5);    // surfaced rather than hidden
  });
});

describe('deduplicateDirectConsignmentSales', () => {
  it('does nothing when there are no consignment sales', () => {
    const s = state({
      hist: [
        { qty: 10, price: 39, date: '2026-06-25', chan: 'Direct' },
        { qty: 5, price: 39, date: '2026-06-25', chan: 'Website' }
      ]
    });
    deduplicateDirectConsignmentSales(s);
    expect(s.hist).toHaveLength(2);
  });

  it('filters out matching direct sales that are duplicate of consignment sales', () => {
    const s = state({
      hist: [
        { qty: 10, price: 39, date: '2026-06-25', chan: 'Consignment', consignmentLink: true },
        { qty: 10, price: 39, date: '2026-06-25', chan: '' }, // duplicate direct sale
        { qty: 5, price: 39, date: '2026-06-25', chan: 'Direct' } // non-duplicate direct sale
      ]
    });
    deduplicateDirectConsignmentSales(s);
    expect(s.hist).toHaveLength(2);
    expect(s.hist.map(h => h.qty)).toEqual([10, 5]);
    expect(s.hist.map(h => h.chan)).toEqual(['Consignment', 'Direct']);
  });

  it('filters only one duplicate direct sale for each consignment sale', () => {
    const s = state({
      hist: [
        { qty: 10, price: 39, date: '2026-06-25', chan: 'Consignment', consignmentLink: true },
        { qty: 10, price: 39, date: '2026-06-25', chan: '' }, // duplicate 1
        { qty: 10, price: 39, date: '2026-06-25', chan: '' }  // duplicate 2 - should be kept (or treated as a separate direct sale)
      ]
    });
    deduplicateDirectConsignmentSales(s);
    expect(s.hist).toHaveLength(2);
    expect(s.hist.filter(h => h.consignmentLink)).toHaveLength(1);
    expect(s.hist.filter(h => !h.consignmentLink)).toHaveLength(1);
  });

  it('removes an unlabeled duplicate logged on a different date than the consignment sale', () => {
    const s = state({
      hist: [
        { qty: 10, price: 39, date: '2026-06-20', chan: 'Consignment', consignmentLink: true },
        { qty: 10, price: 39, date: '2026-06-25', chan: '' } // manual mirror logged on a different date
      ]
    });
    deduplicateDirectConsignmentSales(s);
    expect(s.hist).toHaveLength(1);
    expect(s.hist[0].consignmentLink).toBe(true);
  });

  it('does not remove a genuinely different unlabeled sale on a different date', () => {
    const s = state({
      hist: [
        { qty: 10, price: 39, date: '2026-06-20', chan: 'Consignment', consignmentLink: true },
        { qty: 5, price: 39, date: '2026-06-25', chan: '' }, // different qty - not a duplicate
        { qty: 10, price: 25, date: '2026-06-27', chan: '' } // different price - not a duplicate
      ]
    });
    deduplicateDirectConsignmentSales(s);
    expect(s.hist).toHaveLength(3);
  });
});

describe('recalculateBookStatsFromHistory', () => {
  it('handles an empty or undefined history', () => {
    const s1 = state();
    recalculateBookStatsFromHistory(s1);
    expect(s1.sold).toBe(0);
    expect(s1.revenue).toBe(0);
    expect(s1.chStats).toEqual({});

    const s2 = state({ hist: null });
    recalculateBookStatsFromHistory(s2);
    expect(s2.sold).toBe(0);
    expect(s2.revenue).toBe(0);
    expect(s2.chStats).toEqual({});
  });

  it('calculates basic stats correctly for standard sales', () => {
    const s = state({
      hist: [
        { qty: 2, price: 10 },
        { qty: 3, price: 15 }
      ]
    });
    recalculateBookStatsFromHistory(s);
    expect(s.sold).toBe(5);
    expect(s.revenue).toBe(65); // 2*10 + 3*15
  });

  it('segregates stats by channel and defaults to Manual', () => {
    const s = state({
      hist: [
        { qty: 2, price: 10, chan: 'Direct' },
        { qty: 1, price: 15 }, // no chan, defaults to Manual
        { qty: 3, price: 20, chan: 'Direct' },
        { qty: 5, price: 10, chan: 'Website' }
      ]
    });
    recalculateBookStatsFromHistory(s);
    expect(s.chStats).toEqual({
      Direct: { txns: 2, units: 5, revenue: 80 },
      Manual: { txns: 1, units: 1, revenue: 15 },
      Website: { txns: 1, units: 5, revenue: 50 }
    });
    expect(s.sold).toBe(11);
    expect(s.revenue).toBe(145);
  });

  it('ignores voided sales entirely', () => {
    const s = state({
      hist: [
        { qty: 2, price: 10 },
        { qty: 5, price: 20, voided: true }
      ]
    });
    recalculateBookStatsFromHistory(s);
    expect(s.sold).toBe(2);
    expect(s.revenue).toBe(20);
    expect(s.chStats.Manual).toEqual({ txns: 1, units: 2, revenue: 20 });
  });

  it('includes gratuities in channel stats but excludes them from global sold/revenue', () => {
    const s = state({
      hist: [
        { qty: 2, price: 10 },
        { qty: 1, price: 0, gratuity: true, chan: 'Direct' }, // gratuity
        { qty: 1, price: 20, gratuity: true, chan: 'Manual' } // gratuity with price
      ]
    });
    recalculateBookStatsFromHistory(s);

    // Global stats exclude gratuities
    expect(s.sold).toBe(2);
    expect(s.revenue).toBe(20);

    // Channel stats include gratuities
    expect(s.chStats).toEqual({
      Manual: { txns: 2, units: 3, revenue: 40 }, // 2*10 (regular) + 1*20 (gratuity)
      Direct: { txns: 1, units: 1, revenue: 0 }   // 1*0 (gratuity)
    });
  });

  it('handles missing qty or price gracefully', () => {
    const s = state({
      hist: [
        { qty: undefined, price: 10 }, // missing qty
        { qty: 2, price: undefined },  // missing price
        { qty: null, price: null }     // null values
      ]
    });
    recalculateBookStatsFromHistory(s);
    expect(s.sold).toBe(2);
    expect(s.revenue).toBe(0); // 0*10 + 2*0 + 0*0
    expect(s.chStats.Manual).toEqual({ txns: 3, units: 2, revenue: 0 });
  });
});
