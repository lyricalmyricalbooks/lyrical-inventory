// The per-book "Sales by channel" total must agree with the Revenue KPI, which
// counts gross the artist still holds (direct-to-artist sales not yet forwarded).
import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'harbour';
let app;
beforeAll(async () => { app = await loadApp({ books: [makeBook({ id: BOOK })] }); }, 30000);

describe('Sales by channel with revenue held by the artist', () => {
  it('folds held gross into its channel so the rollup equals recognized revenue', async () => {
    const s = await app.resetBook(BOOK, {
      revenue: 200,
      chStats: { Website: { txns: 2, units: 5, revenue: 200 }, Fair: { txns: 1, units: 3, revenue: 0 } },
      artistTransfers: [{ id: 1, num: 1, chan: 'Fair', qty: 3, price: 20, total: 60, date: '2025-03-01' }],
    });
    const rows = app.main.chStatsWithHeld(s);
    expect(rows.Fair.revenue).toBe(60);
    expect(rows.Website.revenue).toBe(200);
    expect(s.chStats.Fair.revenue).toBe(0); // stored rollup untouched
    const total = Object.values(rows).reduce((a, r) => a + r.revenue, 0);
    expect(total).toBe(app.main.recognizedRevenueOf(s));
  });

  it('a transfer on a channel with no rollup row still counts', async () => {
    const s = await app.resetBook(BOOK, {
      revenue: 0,
      chStats: {},
      artistTransfers: [{ id: 2, num: 2, chan: 'Event', qty: 1, price: 25, total: 25, date: '2025-03-02' }],
    });
    expect(app.main.chStatsWithHeld(s).Event.revenue).toBe(25);
  });
});
