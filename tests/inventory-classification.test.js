import { describe, it, expect } from 'vitest';
import {
  deriveOnHand,
  deriveStockBreakdown,
  transferAuthorStock,
  deductSaleFromStockBreakdown
} from '../src/lib/inventory.js';

const book = (maxPrint = 100) => ({ maxPrint });
const state = ({ stock = 0, authorStock = 0, stockTransfers = [], hist = [], ledger = [] } = {}) => ({
  stock,
  authorStock,
  stockTransfers,
  hist,
  ledger,
});

describe('deriveStockBreakdown', () => {
  it('assigns all stock to publisher when authorStock is 0 or unset', () => {
    const s = state({ stock: 100, authorStock: 0 });
    const b = book(100);
    const breakdown = deriveStockBreakdown(s, b);

    expect(breakdown.totalOnHand).toBe(100);
    expect(breakdown.publisherOnHand).toBe(100);
    expect(breakdown.authorHeld).toBe(0);
    expect(breakdown.pctPublisher).toBe(100);
    expect(breakdown.pctAuthor).toBe(0);
  });

  it('correctly splits stock between publisher and author', () => {
    const s = state({ stock: 100, authorStock: 25 });
    const b = book(100);
    const breakdown = deriveStockBreakdown(s, b);

    expect(breakdown.totalOnHand).toBe(100);
    expect(breakdown.publisherOnHand).toBe(75);
    expect(breakdown.authorHeld).toBe(25);
    expect(breakdown.pctPublisher).toBe(75);
    expect(breakdown.pctAuthor).toBe(25);
  });

  it('clamps authorStock to totalOnHand if authorStock exceeds total stock', () => {
    // Only 40 copies left on hand due to sales, but authorStock was 50
    const s = state({
      stock: 40,
      authorStock: 50,
      hist: [{ qty: 60, chan: 'Direct' }]
    });
    const b = book(100);
    const breakdown = deriveStockBreakdown(s, b);

    expect(breakdown.totalOnHand).toBe(40);
    expect(breakdown.authorHeld).toBe(40);
    expect(breakdown.publisherOnHand).toBe(0);
    expect(breakdown.pctPublisher).toBe(0);
    expect(breakdown.pctAuthor).toBe(100);
  });

  it('handles negative or non-finite authorStock gracefully', () => {
    const s1 = state({ stock: 50, authorStock: -10 });
    const s2 = state({ stock: 50, authorStock: 'invalid' });
    const b = book(50);

    const res1 = deriveStockBreakdown(s1, b);
    expect(res1.authorHeld).toBe(0);
    expect(res1.publisherOnHand).toBe(50);

    const res2 = deriveStockBreakdown(s2, b);
    expect(res2.authorHeld).toBe(0);
    expect(res2.publisherOnHand).toBe(50);
  });

  it('handles 0 total stock without division by zero', () => {
    const s = state({ stock: 0, authorStock: 0, hist: [{ qty: 100 }] });
    const b = book(100);
    const breakdown = deriveStockBreakdown(s, b);

    expect(breakdown.totalOnHand).toBe(0);
    expect(breakdown.publisherOnHand).toBe(0);
    expect(breakdown.authorHeld).toBe(0);
    expect(breakdown.pctPublisher).toBe(0);
    expect(breakdown.pctAuthor).toBe(0);
  });
});

describe('transferAuthorStock', () => {
  it('transfers copies to author and logs the transaction', () => {
    const s = state({ stock: 100, authorStock: 10 });
    const b = book(100);

    const { breakdown, transfer } = transferAuthorStock(s, b, 15, 'For upcoming book fair', '2026-08-26');

    expect(s.authorStock).toBe(25);
    expect(breakdown.publisherOnHand).toBe(75);
    expect(breakdown.authorHeld).toBe(25);
    expect(s.stockTransfers).toHaveLength(1);
    expect(transfer).toMatchObject({
      delta: 15,
      direction: 'to_author',
      qty: 15,
      note: 'For upcoming book fair',
      date: '2026-08-26',
      publisherOnHand: 75,
      authorHeld: 25,
    });
  });

  it('clamps transfer to available publisher stock when handing off to author', () => {
    // Total 100, author already has 80, publisher only has 20 left
    const s = state({ stock: 100, authorStock: 80 });
    const b = book(100);

    // Attempting to transfer 30 when only 20 are at publisher
    const { breakdown } = transferAuthorStock(s, b, 30);

    expect(s.authorStock).toBe(100);
    expect(breakdown.publisherOnHand).toBe(0);
    expect(breakdown.authorHeld).toBe(100);
  });

  it('returns copies from author back to publisher and logs the transaction', () => {
    const s = state({ stock: 100, authorStock: 30 });
    const b = book(100);

    const { breakdown, transfer } = transferAuthorStock(s, b, -10, 'Returned unsold fair copies', '2026-08-26');

    expect(s.authorStock).toBe(20);
    expect(breakdown.publisherOnHand).toBe(80);
    expect(breakdown.authorHeld).toBe(20);
    expect(s.stockTransfers).toHaveLength(1);
    expect(transfer).toMatchObject({
      delta: -10,
      direction: 'from_author',
      qty: 10,
      note: 'Returned unsold fair copies',
      date: '2026-08-26',
      publisherOnHand: 80,
      authorHeld: 20,
    });
  });

  it('clamps return to available author stock', () => {
    const s = state({ stock: 100, authorStock: 10 });
    const b = book(100);

    // Attempting to return 25 when author only has 10
    const { breakdown } = transferAuthorStock(s, b, -25);

    expect(s.authorStock).toBe(0);
    expect(breakdown.publisherOnHand).toBe(100);
    expect(breakdown.authorHeld).toBe(0);
  });

  it('is a safe no-op on zero delta', () => {
    const s = state({ stock: 100, authorStock: 20 });
    const b = book(100);

    const { breakdown, transfer } = transferAuthorStock(s, b, 0);

    expect(s.authorStock).toBe(20);
    expect(transfer).toBeNull();
    expect(s.stockTransfers).toHaveLength(0);
  });
});

describe('deductSaleFromStockBreakdown', () => {
  it('deducts units from authorStock when sale is fulfilled by author', () => {
    const s = state({ stock: 50, authorStock: 15 });
    deductSaleFromStockBreakdown(s, 5, true);

    expect(s.authorStock).toBe(10);
  });

  it('clamps authorStock to zero on oversell by author', () => {
    const s = state({ stock: 50, authorStock: 5 });
    deductSaleFromStockBreakdown(s, 8, true);

    expect(s.authorStock).toBe(0);
  });

  it('leaves authorStock untouched when sale is fulfilled by publisher', () => {
    const s = state({ stock: 50, authorStock: 15 });
    deductSaleFromStockBreakdown(s, 5, false);

    expect(s.authorStock).toBe(15);
  });

  it('handles invalid inputs gracefully', () => {
    const s = state({ stock: 50, authorStock: 15 });
    deductSaleFromStockBreakdown(s, -5, true);
    deductSaleFromStockBreakdown(s, null, true);

    expect(s.authorStock).toBe(15);
  });
});
