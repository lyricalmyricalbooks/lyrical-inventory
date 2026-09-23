import { describe, it, expect } from 'vitest';
import { syncBreakEvenTier } from '../src/lib/breakeven.js';

describe('syncBreakEvenTier — first tier follows production cost only while it means break-even', () => {
  it('moves a threshold that matched the old production cost', () => {
    const tiers = [{ label: 'Recoup', revenueUpTo: 5000 }, { label: 'Profit', revenueUpTo: null }];
    syncBreakEvenTier(tiers, 5000, 6100);
    expect(tiers[0].revenueUpTo).toBe(6100);
    expect(tiers[1].revenueUpTo).toBeNull();
  });

  it('moves a tier labelled break-even even when its threshold differs', () => {
    const tiers = [{ label: 'Break-Even point', revenueUpTo: 1234 }];
    syncBreakEvenTier(tiers, 5000, 6100);
    expect(tiers[0].revenueUpTo).toBe(6100);
  });

  it('leaves a custom threshold alone', () => {
    const tiers = [{ label: 'Launch', revenueUpTo: 2000 }];
    syncBreakEvenTier(tiers, 5000, 6100);
    expect(tiers[0].revenueUpTo).toBe(2000);
  });

  it('never gives an open-ended first tier a threshold', () => {
    const tiers = [{ label: 'Break-even', revenueUpTo: null }];
    syncBreakEvenTier(tiers, 0, 6100);
    expect(tiers[0].revenueUpTo).toBeNull();
  });

  it('treats a missing threshold as zero, matching a book with no prior cost', () => {
    const tiers = [{ label: 'First run' }];
    syncBreakEvenTier(tiers, 0, 800);
    expect(tiers[0].revenueUpTo).toBe(800);
  });

  it('ignores books without tiers', () => {
    expect(() => syncBreakEvenTier(undefined, 0, 10)).not.toThrow();
    expect(() => syncBreakEvenTier([], 0, 10)).not.toThrow();
  });
});
