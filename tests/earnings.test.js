import { describe, it, expect } from 'vitest';
import { calcArtistEarnings, tierEffectiveCap, payoutRequestCovered } from '../src/lib/earnings.js';

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
    it('counts a held sale in earnings but only credits the artist share against owed', () => {
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
      expect(r.publisherCutHeldByArtist).toBeCloseTo(10);    // the cut to collect back
      // owed = earned - payouts - artist's own held share = 60 - 0 - 10 = 50.
      // The publisher's $10 cut held by the artist is a separate receivable and
      // must NOT reduce owed (it isn't a payment to the artist).
      expect(r.owedToArtist).toBeCloseTo(50);
      // publisher keeps their cut of all sales incl. held gross: 100 + 20 - 60 = 60
      expect(r.netPublisher).toBeCloseTo(60);
    });

    it('owes nothing extra when a held sale exactly covers the artist share', () => {
      const book = { profitTiers: [tier('Royalty', null, 50)] };
      // a single held sale, no settled earnings
      const state = { revenue: 0, hist: [sale(1, 20, { artistPending: true })], artistPayouts: [] };
      const r = calcArtistEarnings(book, state);
      expect(r.totalArtistEarned).toBeCloseTo(10);
      expect(r.heldByArtistGross).toBeCloseTo(20);
      // owed = 10 - 0 - 10 = 0: the artist already holds their full $10 share.
      expect(r.owedToArtist).toBeCloseTo(0);
      // ...and still owes the publisher their $10 cut, surfaced separately.
      expect(r.publisherCutHeldByArtist).toBeCloseTo(10);
    });

    it('goes negative only on genuine overpayment (payouts exceed net earnings)', () => {
      const book = { profitTiers: [tier('Royalty', null, 50)] };
      const state = { revenue: 100, hist: [sale(1, 100)], artistPayouts: [{ amount: 70 }] };
      const r = calcArtistEarnings(book, state);
      expect(r.totalArtistEarned).toBeCloseTo(50);
      // owed = 50 - 70 = -20 → the artist has been overpaid by 20
      expect(r.owedToArtist).toBeCloseTo(-20);
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

  it('accumulates to exact cents over many tiny sales (no float drift)', () => {
    // 0.10 @ 33% = 0.033 → rounds to 0.03 per sale. 300 such sales must land on
    // an exact-cents value, not a 0.3000000000004-style float artifact.
    const book = { profitTiers: [tier('Royalty', null, 33)] };
    const hist = Array.from({ length: 300 }, () => sale(1, 0.1));
    const state = { revenue: 30, hist, artistPayouts: [{ amount: 0.1 }, { amount: 0.2 }] };
    const r = calcArtistEarnings(book, state);
    // Each accumulator should be a clean 2-decimal number.
    const cents = (n) => Math.abs(Math.round(n * 100) - n * 100);
    expect(cents(r.totalArtistEarned)).toBeLessThan(1e-6);
    expect(cents(r.owedToArtist)).toBeLessThan(1e-6);
    expect(cents(r.totalPaidToArtist)).toBeLessThan(1e-6);
    // 0.1 + 0.2 must be exactly 0.3, not 0.30000000000000004.
    expect(r.totalPaidToArtist).toBe(0.3);
  });
});

describe('payoutRequestCovered', () => {
  const stats = (totalPaidToArtist, owedToArtist = 0) => ({ totalPaidToArtist, owedToArtist });

  it('is not covered until enough has been paid since the request', () => {
    const req = { amount: 100, paidAtRequest: 40 };
    expect(payoutRequestCovered(req, stats(40))).toBe(false);   // nothing paid since
    expect(payoutRequestCovered(req, stats(100))).toBe(false);  // 60 of the 100
    expect(payoutRequestCovered(req, stats(140))).toBe(true);   // exactly 100
    expect(payoutRequestCovered(req, stats(200))).toBe(true);   // more than asked
  });

  it('does not settle a fresh request just because a payout exists already', () => {
    // The regression this replaced: settlement was "is any payout dated on or
    // after the request's day". A payout recorded earlier the same day made a
    // brand-new request read as settled the moment it was sent.
    const req = { amount: 250, paidAtRequest: 900 };
    expect(payoutRequestCovered(req, stats(900))).toBe(false);
  });

  it('tolerates a rounding crumb rather than leaving a request open', () => {
    const req = { amount: 100, paidAtRequest: 0 };
    expect(payoutRequestCovered(req, stats(99.996))).toBe(true);
    expect(payoutRequestCovered(req, stats(99.98))).toBe(false);
  });

  it('falls back to a cleared balance for requests with no baseline', () => {
    // Legacy rows written before paidAtRequest existed have nothing to
    // subtract from, so they only close once nothing at all is owed.
    const legacy = { amount: 100 };
    expect(payoutRequestCovered(legacy, stats(500, 12))).toBe(false);
    expect(payoutRequestCovered(legacy, stats(500, 0))).toBe(true);
    expect(payoutRequestCovered(legacy, stats(500, 0.004))).toBe(true);
  });

  it('is never covered without a request or stats', () => {
    expect(payoutRequestCovered(null, stats(10))).toBe(false);
    expect(payoutRequestCovered({ amount: 1 }, null)).toBe(false);
  });
});
