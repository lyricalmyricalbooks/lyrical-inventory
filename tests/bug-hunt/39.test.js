import { test, expect } from 'vitest';
import { calcArtistEarnings } from '../../src/lib/earnings.js';
test('a break-even tier listed first still applies below production cost', () => {
  const book = { productionCost: 1000, profitTiers: [
    { label: 'Pre break-even', artistPct: 0 },
    { label: 'Standard', revenueUpTo: 5000, artistPct: 50 },
    { label: 'Post', artistPct: 70 },
  ]};
  const r = calcArtistEarnings(book, { hist: [{ qty: 1, price: 2000 }] });
  expect(r.totalArtistEarned).toBe(500);
});
