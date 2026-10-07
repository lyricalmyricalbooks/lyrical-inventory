import { describe, it, expect } from 'vitest';
import { applyBreakEvenTierMove, breakEvenTierMove, readProductionCostInput } from '../src/lib/breakeven.js';

// What a save does once the publisher agrees: work out the move, then apply it.
function syncBreakEvenTier(profitTiers, previousCost, newCost) {
  const move = breakEvenTierMove(profitTiers, previousCost, newCost);
  applyBreakEvenTierMove(profitTiers, move);
  return move;
}

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

describe('breakEvenTierMove — reports the change without making it', () => {
  it('returns old and new thresholds and leaves the tier untouched', () => {
    const tiers = [{ label: 'Recoup', revenueUpTo: 5000 }];
    expect(breakEvenTierMove(tiers, 5000, 6100)).toEqual({ from: 5000, to: 6100 });
    expect(tiers[0].revenueUpTo).toBe(5000);
  });

  it('returns null when nothing would move', () => {
    expect(breakEvenTierMove([{ label: 'Launch', revenueUpTo: 2000 }], 5000, 6100)).toBeNull();
    expect(breakEvenTierMove([{ label: 'Break-even', revenueUpTo: 6100 }], 5000, 6100)).toBeNull();
    expect(breakEvenTierMove([{ label: 'Break-even', revenueUpTo: null }], 0, 6100)).toBeNull();
  });
});

describe('applyBreakEvenTierMove — lands an agreed move', () => {
  it('sets only the first tier to the new threshold', () => {
    const tiers = [{ label: 'Recoup', revenueUpTo: 5000 }, { label: 'Profit', revenueUpTo: null }];
    applyBreakEvenTierMove(tiers, { from: 5000, to: 6100 });
    expect(tiers).toEqual([{ label: 'Recoup', revenueUpTo: 6100 }, { label: 'Profit', revenueUpTo: null }]);
  });

  it('does nothing without a move or without tiers', () => {
    const tiers = [{ label: 'Recoup', revenueUpTo: 5000 }];
    applyBreakEvenTierMove(tiers, null);
    expect(tiers[0].revenueUpTo).toBe(5000);
    expect(() => applyBreakEvenTierMove(undefined, { from: 0, to: 1 })).not.toThrow();
    expect(() => applyBreakEvenTierMove([], { from: 0, to: 1 })).not.toThrow();
  });
});

describe('readProductionCostInput — flags a cost that disappeared', () => {
  it('saves blank and unreadable entries as zero, as before', () => {
    expect(readProductionCostInput('', 0)).toEqual({ value: 0, suspicious: false });
    expect(readProductionCostInput('abc', 0)).toEqual({ value: 0, suspicious: false });
  });

  it('flags a book that had a cost and is now blank or zero', () => {
    expect(readProductionCostInput('', 6100).suspicious).toBe(true);
    expect(readProductionCostInput('0', 6100).suspicious).toBe(true);
  });

  it('does not flag a real cost', () => {
    expect(readProductionCostInput('5200.50', 6100)).toEqual({ value: 5200.5, suspicious: false });
  });
});
