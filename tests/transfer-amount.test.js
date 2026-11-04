import { describe, it, expect } from 'vitest';
import { transferAmount, transferQtyLabel, heldSaleForTransfer } from '../src/lib/money.js';
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

describe('heldSaleForTransfer', () => {
  // Two held sales under one order number (a split or re-entered order).
  const hist = [
    { num: '#12', sheetsId: 'evt_a', artistPending: true, qty: 1 },
    { num: '#12', sheetsId: 'evt_b', artistPending: true, qty: 2 },
    { num: '#13', artistPending: false },
  ];
  it('finds the sale by its shared sheet id, not the first row with the number', () => {
    expect(heldSaleForTransfer(hist, { num: '#12', sheetsId: 'evt_b' })).toBe(hist[1]);
  });
  it('finds nothing rather than the wrong sale when the id matches no held row', () => {
    expect(heldSaleForTransfer(hist, { num: '#12', sheetsId: 'evt_gone' })).toBeUndefined();
  });
  it('falls back to the order number for a legacy transfer with no id', () => {
    expect(heldSaleForTransfer(hist, { num: '#12' })).toBe(hist[0]);
    expect(heldSaleForTransfer(hist, { num: '#13' })).toBeUndefined();
  });
});
