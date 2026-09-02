import { describe, it, expect } from 'vitest';
import { calculateBreakEven } from '../src/lib/breakeven.js';

describe('calculateBreakEven — explicit units needed at list price and realized pace', () => {
  it('accurately calculates user screenshot scenario: 57 units at CA$65.00 list price', () => {
    const result = calculateBreakEven({
      cost: 6100.00,
      recognizedRev: 2424.50,
      listPrice: 65.00,
      currency: 'CAD'
    });

    expect(result.remaining).toBeCloseTo(3675.50, 2);
    expect(result.pctBe).toBeCloseTo(39.7459, 2);
    expect(result.broken).toBe(false);
    expect(result.isClose).toBe(false);
    expect(result.unitsNeededAtList).toBe(57);
    expect(result.unitsBadgeText).toBe('📚 ~57 units needed at list price (CA$65.00)');
    expect(result.unitsBadgeTitle).toContain('Calculated as CA$3,675.50 remaining ÷ CA$65.00 list price');
    expect(result.primaryExplanation).toContain('Requires selling ~57 more units at full list price of CA$65.00 to recover the remaining CA$3,675.50.');
  });

  it('handles singular unit needed correctly', () => {
    const result = calculateBreakEven({
      cost: 100,
      recognizedRev: 70,
      listPrice: 40,
      currency: 'USD'
    });

    expect(result.remaining).toBe(30);
    expect(result.unitsNeededAtList).toBe(1);
    expect(result.unitsBadgeText).toBe('📚 ~1 unit needed at list price (US$40.00)');
    expect(result.primaryExplanation).toContain('Requires selling ~1 more unit at full list price of US$40.00 to recover the remaining US$30.00.');
  });

  it('handles zero or missing list price gracefully without division by zero', () => {
    const result = calculateBreakEven({
      cost: 1000,
      recognizedRev: 200,
      listPrice: 0,
      currency: 'CAD'
    });

    expect(result.remaining).toBe(800);
    expect(result.hasListPrice).toBe(false);
    expect(result.unitsNeededAtList).toBe(0);
    expect(result.unitsBadgeText).toBe('📚 List price not set');
    expect(result.unitsBadgeTitle).toContain('Set a list price in book settings');
    expect(result.primaryExplanation).toContain('Set a list price in book settings to calculate the units needed to break even.');
  });

  it('handles fully broken even project', () => {
    const result = calculateBreakEven({
      cost: 5000,
      recognizedRev: 5500,
      listPrice: 50,
      currency: 'EUR'
    });

    expect(result.remaining).toBe(0);
    expect(result.broken).toBe(true);
    expect(result.pctBe).toBe(100);
    expect(result.unitsNeededAtList).toBe(0);
    expect(result.unitsBadgeText).toBe('✓ Fully recovered');
    expect(result.primaryExplanation).toContain('Production costs fully recovered — everything earned from here is profit.');
  });

  it('calculates historical realized average and secondary pace note when avg differs from list price', () => {
    // 40 copies sold yielding CA$2,000 = CA$50.00 realized avg vs CA$65.00 list price
    const result = calculateBreakEven({
      cost: 6100,
      recognizedRev: 2000,
      listPrice: 65,
      sold: 40,
      currency: 'CAD'
    });

    expect(result.avgRev).toBe(50.00);
    expect(result.unitsNeededAtList).toBe(Math.ceil(4100 / 65)); // 64
    expect(result.unitsNeededAtAvg).toBe(Math.ceil(4100 / 50)); // 82
    expect(result.paceNote).toContain('At your historical realized average of CA$50.00/unit');
    expect(result.paceNote).toContain('~82 units');
  });

  it('flags stock deficit when current inventory is less than units needed', () => {
    const result = calculateBreakEven({
      cost: 6100,
      recognizedRev: 2424.50,
      listPrice: 65,
      stock: 35,
      currency: 'CAD'
    });

    expect(result.unitsNeededAtList).toBe(57);
    expect(result.stockDeficit).toBe(22); // 57 - 35
    expect(result.stockNote).toContain('Current on-hand stock: 35 units (22 more needed beyond current inventory).');
  });

  it('does not flag deficit when stock is sufficient', () => {
    const result = calculateBreakEven({
      cost: 6100,
      recognizedRev: 2424.50,
      listPrice: 65,
      stock: 100,
      currency: 'CAD'
    });

    expect(result.unitsNeededAtList).toBe(57);
    expect(result.stockDeficit).toBe(0);
    expect(result.stockNote).toBe('');
  });
});