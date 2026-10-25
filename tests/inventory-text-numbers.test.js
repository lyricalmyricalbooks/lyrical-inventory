// Counts and prices saved as text ("2" rather than 2) — from a form, an import
// or a Sheet — must add up as numbers. `total += "2"` turns a running count
// into "02"; the type check (npm run typecheck) is what found these sums.
import { describe, it, expect } from 'vitest';
import {
  buildOrderTimeline, deriveOnHand, inventoryBreakdown, recalculateBookStatsFromHistory,
} from '../src/lib/inventory.js';

const book = { id: 'bk', maxPrint: 100 };

describe('stock and sales figures with counts stored as text', () => {
  const s = () => ({
    hist: [
      { qty: '2', price: '40', chan: 'Website', date: '2026-10-01' },
      { qty: 3, price: 40, chan: 'Website', date: '2026-10-02' },
      { qty: '1', price: '20', chan: 'Fair', date: '2026-10-03', gratuity: true },
    ],
    ledger: [
      { type: 'Shipment', qty: '5', date: '2026-10-04' },
      { type: 'Return', status: 'restocked', qty: '2', date: '2026-10-05' },
    ],
  });

  it('counts the copies sold and on consignment as numbers', () => {
    const b = inventoryBreakdown(s(), book);
    expect(b.directSold).toBe(5);
    expect(b.gratuities).toBe(1);
    expect(b.onConsignment).toBe(3);
    expect(b.onHand).toBe(100 - 2 - 3 - 1 - 5 + 2);
    expect(b.unaccounted).toBe(0);
  });

  it('agrees with the on-hand count in the History stock column', () => {
    const timeline = buildOrderTimeline(s(), book);
    expect(timeline[0]._after).toBe(deriveOnHand(s(), book));
    expect(typeof timeline[0]._after).toBe('number');
  });

  it('totals copies sold and revenue as numbers', () => {
    const state = s();
    recalculateBookStatsFromHistory(state);
    expect(state.sold).toBe(5);
    expect(state.revenue).toBe(200);
    expect(state.chStats.Website).toEqual({ txns: 2, units: 5, revenue: 200 });
  });
});
