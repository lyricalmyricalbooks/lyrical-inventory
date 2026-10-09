import { describe, it, expect } from 'vitest';
import { calcArtistEarnings, unpaidSalesSummary } from '../src/lib/earnings.js';

// hist is stored newest first, like the app's state.
const book = {
  productionCost: 100,
  profitTiers: [
    { label: 'Until break-even', artistPct: 20, revenueUpTo: 100 },
    { label: 'After', artistPct: 40, revenueUpTo: null },
  ],
};
const sale = (date, qty, price, extra = {}) => ({ date, qty, price, ...extra });

describe('unpaidSalesSummary', () => {
  it('returns null when nothing is owed', () => {
    expect(unpaidSalesSummary(book, { hist: [sale('2026-01-01', 1, 10)] }, 0)).toBeNull();
    expect(unpaidSalesSummary(book, { hist: [] }, 5)).toBeNull();
  });

  it('pins the owed balance on the newest sales, at the rate they earned', () => {
    const state = {
      hist: [sale('2026-03-01', 2, 25), sale('2026-02-01', 4, 25)],
      artistPayouts: [{ amount: 20 }],
    };
    const stats = calcArtistEarnings(book, state);
    // 100 @20% = 20 (paid), then 50 @40% = 20 owed.
    expect(stats.owedToArtist).toBe(20);
    const u = unpaidSalesSummary(book, state, stats.owedToArtist);
    expect(u).toEqual({ copies: 2, revenue: 50, rates: [40], since: '2026-03-01' });
  });

  it('counts a partly paid sale and reports the spread of rates', () => {
    const state = { hist: [sale('2026-03-01', 6, 25)], artistPayouts: [{ amount: 10 }] };
    const stats = calcArtistEarnings(book, state);
    // 150 sold: 100 @20% (20) + 50 @40% (20) = 40 earned; 10 paid → 30 owed.
    const u = unpaidSalesSummary(book, state, stats.owedToArtist);
    expect(u.copies).toBe(6);
    expect(u.rates).toEqual([20, 40]);
    expect(u.revenue).toBe(100); // 50 @40% + 50 @20%
    expect(u.since).toBe('2026-03-01');
  });

  it('ignores sales the artist already holds the cash for', () => {
    const state = {
      hist: [sale('2026-04-01', 1, 50, { artistPending: true }), sale('2026-03-01', 6, 25)],
      artistPayouts: [{ amount: 40 }],
    };
    const stats = calcArtistEarnings(book, state);
    expect(stats.owedToArtist).toBe(0);
    expect(unpaidSalesSummary(book, state, stats.owedToArtist)).toBeNull();
  });
});
