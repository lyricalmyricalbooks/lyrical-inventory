import { describe, it, expect } from 'vitest';
import { channelMixRows } from '../src/lib/channel-mix.js';

// "Sales by channel" is the dashboard's answer to where the money comes from.
// A wrong total or a mis-scaled bar would have the publisher push effort at the
// wrong channel, so the shaping is worth pinning down.

describe('channelMixRows', () => {
  it('totals transactions, units and revenue across every channel', () => {
    const { totals } = channelMixRows({
      Website: { txns: 4, units: 6, revenue: 120 },
      'Book fair': { txns: 2, units: 5, revenue: 100 },
    });

    expect(totals.txns).toBe(6);
    expect(totals.units).toBe(11);
    expect(totals.revenue).toBe(220);
    expect(totals.channels).toBe(2);
    expect(totals.earningChannels).toBe(2);
  });

  it('puts the biggest earner first regardless of insertion order', () => {
    // Object key order follows whichever channel was used first, which would
    // reshuffle the table's meaning as the book ages.
    const { rows } = channelMixRows({
      Gratuity: { txns: 1, units: 1, revenue: 0 },
      'In person': { txns: 3, units: 3, revenue: 60 },
      Website: { txns: 4, units: 6, revenue: 120 },
    });

    expect(rows.map(r => r.chan)).toEqual(['Website', 'In person', 'Gratuity']);
  });

  it('breaks a revenue tie by units, then by name, so the order is stable', () => {
    const { rows } = channelMixRows({
      Zed: { txns: 1, units: 2, revenue: 50 },
      Alpha: { txns: 1, units: 2, revenue: 50 },
      Bulk: { txns: 1, units: 9, revenue: 50 },
    });

    expect(rows.map(r => r.chan)).toEqual(['Bulk', 'Alpha', 'Zed']);
  });

  it('reports each channel share as a percent of total revenue', () => {
    const { rows } = channelMixRows({
      Website: { txns: 1, units: 1, revenue: 75 },
      'Book fair': { txns: 1, units: 1, revenue: 25 },
    });

    expect(rows[0].share).toBeCloseTo(75, 5);
    expect(rows[1].share).toBeCloseTo(25, 5);
  });

  it('scales the bar against the top channel, not against the total', () => {
    // Sharing the leader's scale is what keeps a minor channel looking minor.
    const { rows } = channelMixRows({
      Website: { txns: 1, units: 1, revenue: 200 },
      'Book fair': { txns: 1, units: 1, revenue: 50 },
    });

    expect(rows[0].barPct).toBe(100);
    expect(rows[1].barPct).toBe(25);
  });

  it('names the leading channel and its share for the summary line', () => {
    const { totals } = channelMixRows({
      Website: { txns: 4, units: 6, revenue: 150 },
      'In person': { txns: 2, units: 2, revenue: 50 },
    });

    expect(totals.leader).toBe('Website');
    expect(totals.leaderShare).toBeCloseTo(75, 5);
  });

  it('has no leader when nothing has earned yet', () => {
    // Gratuity copies move units at zero revenue. Calling that "leading" would
    // be actively misleading on a book that has not sold anything.
    const { rows, totals } = channelMixRows({
      Gratuity: { txns: 3, units: 3, revenue: 0 },
    });

    expect(totals.leader).toBeNull();
    expect(totals.leaderShare).toBe(0);
    expect(totals.earningChannels).toBe(0);
    expect(rows[0].share).toBe(0);
    expect(rows[0].barPct).toBe(0);
  });

  it('never emits a negative bar width for a refund-heavy channel', () => {
    const { rows } = channelMixRows({
      Website: { txns: 4, units: 6, revenue: 200 },
      Refunded: { txns: 1, units: 0, revenue: -40 },
    });

    const refunded = rows.find(r => r.chan === 'Refunded');
    expect(refunded.barPct).toBe(0);
    expect(refunded.revenue).toBe(-40);
  });

  it('skips malformed entries instead of poisoning the totals with NaN', () => {
    const { totals } = channelMixRows({
      Website: { txns: 4, units: 6, revenue: 120 },
      Broken: { txns: 'lots', units: undefined, revenue: null },
      Missing: null,
    });

    expect(Number.isFinite(totals.revenue)).toBe(true);
    expect(totals.txns).toBe(4);
    expect(totals.units).toBe(6);
    expect(totals.revenue).toBe(120);
  });

  it('returns empty rows and zero totals for a missing rollup rather than throwing', () => {
    for (const input of [{}, null, undefined]) {
      const { rows, totals } = channelMixRows(input);
      expect(rows).toEqual([]);
      expect(totals.revenue).toBe(0);
      expect(totals.channels).toBe(0);
      expect(totals.leader).toBeNull();
    }
  });
});
