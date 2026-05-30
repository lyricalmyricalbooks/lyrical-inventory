import { describe, it, expect } from 'vitest';
import { calcArtistEarnings, tierEffectiveCap } from '../src/lib/earnings.js';

const tier = (label, revenueUpTo, artistPct) => ({ label, revenueUpTo, artistPct });
const sale = (qty, price, extra = {}) => ({ qty, price, ...extra });

describe('tierEffectiveCap', () => {
  it('returns revenueUpTo for a normal capped tier', () => {
    expect(tierEffectiveCap(tier('Tier 1', 500, 50))).toBe(500);
  });
  it('returns null for an uncapped tier', () => {
    expect(tierEffectiveCap(tier('Final', null, 50))).toBe(null);
  });
  it('caps a break-even tier at production cost', () => {
    expect(tierEffectiveCap(tier('Break-even', null, 0), 200)).toBe(200);
  });
  it('ignores production cost for non break-even tiers', () => {
    expect(tierEffectiveCap(tier('Royalty', 500, 50), 200)).toBe(500);
  });
});

describe('calcArtistEarnings', () => {
  it('returns null when no tiers are configured', () => {
    expect(calcArtistEarnings({ profitTiers: [] }, { hist: [] })).toBe(null);
    expect(calcArtistEarnings({}, { hist: [] })).toBe(null);
    expect(calcArtistEarnings(null, { hist: [] })).toBe(null);
  });

  it('splits settled revenue by a single uncapped tier', () => {
    const book = { profitTiers: [tier('Royalty', null, 50)] };
    const state = { revenue: 100, hist: [sale(1, 100)], artistPayouts: [] };
    const r = calcArtistEarnings(book, state);
    expect(r.totalArtistEarned).toBeCloseTo(50);
    expect(r.cumulativeRevenue).toBeCloseTo(100);
    expect(r.heldByArtistGross).toBe(0);
    expect(r.owedToArtist).toBeCloseTo(50);
    expect(r.netPublisher).toBeCloseTo(50);
  });

  it('subtracts payouts from what is owed', () => {
    const book = { profitTiers: [tier('Royalty', null, 50)] };
    const state = { revenue: 100, hist: [sale(1, 100)], artistPayouts: [{ amount: 20 }] };
    const r = calcArtistEarnings(book, state);
    expect(r.totalPaidToArtist).toBeCloseTo(20);
    expect(r.owedToArtist).toBeCloseTo(30);
  });

  it('ignores voided, gratuity, and zero-qty entries, and voided payouts', () => {
    const book = { profitTiers: [tier('Royalty', null, 50)] };
    const state = {
      revenue: 100,
      hist: [
        sale(1, 100),
        sale(1, 100, { voided: true }),
        sale(1, 100, { gratuity: true }),
        sale(0, 100),
      ],
      artistPayouts: [{ amount: 10 }, { amount: 99, voided: true }],
    };
    const r = calcArtistEarnings(book, state);
    expect(r.totalArtistEarned).toBeCloseTo(50);
    expect(r.totalPaidToArtist).toBeCloseTo(10);
  });

  describe('held (direct-to-artist) sales', () => {
    it('counts a held sale in earnings and nets its gross out of owed', () => {
      const book = { profitTiers: [tier('Royalty', null, 50)] };
      // 100 settled + 20 collected directly and held by the artist
      const state = {
        revenue: 100,
        hist: [sale(1, 100), sale(1, 20, { artistPending: true })],
        artistPayouts: [],
      };
      const r = calcArtistEarnings(book, state);
      expect(r.totalArtistEarned).toBeCloseTo(60);          // 50 + 10
      expect(r.heldByArtistGross).toBeCloseTo(20);
      expect(r.heldByArtistShare).toBeCloseTo(10);
      expect(r.publisherCutHeldByArtist).toBeCloseTo(10);
      // owed = earned - payouts - held gross = 60 - 0 - 20 = 40
      expect(r.owedToArtist).toBeCloseTo(40);
      // publisher keeps their cut of all sales incl. held gross: 100 + 20 - 60 = 60
      expect(r.netPublisher).toBeCloseTo(60);
    });

    it('goes negative when the artist holds more than they have earned', () => {
      const book = { profitTiers: [tier('Royalty', null, 50)] };
      // only a held sale, no settled earnings to offset it
      const state = { revenue: 0, hist: [sale(1, 20, { artistPending: true })], artistPayouts: [] };
      const r = calcArtistEarnings(book, state);
      expect(r.totalArtistEarned).toBeCloseTo(10);
      expect(r.heldByArtistGross).toBeCloseTo(20);
      // owed = 10 - 0 - 20 = -10 → the artist owes the publisher 10
      expect(r.owedToArtist).toBeCloseTo(-10);
      expect(r.publisherCutHeldByArtist).toBeCloseTo(10);
    });
  });

  it('walks a break-even tier capped at production cost', () => {
    const book = {
      productionCost: 100,
      profitTiers: [tier('Break-even', null, 0), tier('Post break-even', null, 50)],
    };
    const state = { revenue: 150, hist: [sale(1, 150)], artistPayouts: [] };
    const r = calcArtistEarnings(book, state);
    // first 100 in the 0% break-even tier, next 50 at 50% = 25
    expect(r.totalArtistEarned).toBeCloseTo(25);
    expect(r.perTier[0].revenue).toBeCloseTo(100);
    expect(r.perTier[0].artistEarned).toBeCloseTo(0);
    expect(r.perTier[1].revenue).toBeCloseTo(50);
    expect(r.perTier[1].artistEarned).toBeCloseTo(25);
  });

  it('splits revenue across a capped tier and the remainder tier', () => {
    const book = { profitTiers: [tier('Tier 1', 500, 50), tier('Tier 2', null, 30)] };
    const state = { revenue: 800, hist: [sale(1, 800)], artistPayouts: [] };
    const r = calcArtistEarnings(book, state);
    // 500 @ 50% = 250, then 300 @ 30% = 90 → 340
    expect(r.totalArtistEarned).toBeCloseTo(340);
    expect(r.perTier[0].artistEarned).toBeCloseTo(250);
    expect(r.perTier[1].artistEarned).toBeCloseTo(90);
  });
});
