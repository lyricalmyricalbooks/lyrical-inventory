import { describe, it, expect } from 'vitest';
import { transferAmount, transferQtyLabel } from '../src/lib/money.js';

describe('transferAmount', () => {
  it('uses the stored total', () => expect(transferAmount({ total: 80, qty: 2, price: 40 })).toBe(80));
  it('falls back to qty × price when total is missing', () => expect(transferAmount({ qty: 2, price: 40 })).toBe(80));
  it('returns null instead of NaN when nothing usable is stored', () => {
    expect(transferAmount({ num: '4', date: '2026-07-06' })).toBeNull();
    expect(transferAmount({ total: 'abc' })).toBeNull();
    expect(transferAmount(null)).toBeNull();
  });
  it('keeps a real zero', () => expect(transferAmount({ total: 0 })).toBe(0));
});

describe('transferQtyLabel', () => {
  it('shows the count', () => expect(transferQtyLabel({ qty: 3 })).toBe('3×'));
  it('is empty when the count is missing', () => expect(transferQtyLabel({})).toBe(''));
});
