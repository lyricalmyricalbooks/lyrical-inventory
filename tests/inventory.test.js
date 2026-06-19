import { describe, it, expect } from 'vitest';
import { deriveOnHand } from '../src/lib/inventory.js';

const book = (maxPrint = 100) => ({ maxPrint });
const sale = (qty, extra = {}) => ({ qty, ...extra });
const ship = (qty, extra = {}) => ({ type: 'Shipment', qty, ...extra });
const ret = (qty, status, extra = {}) => ({ type: 'Return', qty, status, ...extra });
const state = ({ stock = 0, hist = [], ledger = [] } = {}) => ({ stock, hist, ledger });

describe('deriveOnHand', () => {
  it('returns the full print run when nothing has happened', () => {
    expect(deriveOnHand(state(), book(100))).toBe(100);
  });

  it('subtracts direct sales recorded in history', () => {
    const s = state({ hist: [sale(3), sale(2)] });
    expect(deriveOnHand(s, book(100))).toBe(95);
  });

  it('ignores voided history entries', () => {
    const s = state({ hist: [sale(3), sale(2, { voided: true })] });
    expect(deriveOnHand(s, book(100))).toBe(97);
  });

  it('excludes consignment-sale mirrors (already left as a Shipment)', () => {
    // The Shipment removed the 4 copies; the consignmentLink sale must not
    // subtract them a second time.
    const s = state({
      hist: [sale(2, { consignmentLink: true })],
      ledger: [ship(4)],
    });
    expect(deriveOnHand(s, book(100))).toBe(96);
  });

  it('subtracts books out on consignment (shipments)', () => {
    const s = state({ ledger: [ship(4), ship(6)] });
    expect(deriveOnHand(s, book(100))).toBe(90);
  });

  it('ignores voided shipments', () => {
    const s = state({ ledger: [ship(4), ship(6, { voided: true })] });
    expect(deriveOnHand(s, book(100))).toBe(96);
  });

  it('adds back good (restocked) returns but not written-off ones', () => {
    const s = state({
      ledger: [ship(10), ret(3, 'restocked'), ret(2, 'written off')],
    });
    // 100 − 10 shipped + 3 restocked (written-off copies stay gone) = 93
    expect(deriveOnHand(s, book(100))).toBe(93);
  });

  it('combines direct sales, consignment movement, and returns', () => {
    const s = state({
      hist: [sale(5), sale(2, { consignmentLink: true }), sale(1, { voided: true })],
      ledger: [ship(8), ret(2, 'restocked')],
    });
    // 100 − 5 direct − 8 shipped + 2 restocked = 89 (consignment sale + void excluded)
    expect(deriveOnHand(s, book(100))).toBe(89);
  });

  it('never returns a negative count', () => {
    const s = state({ hist: [sale(150)] });
    expect(deriveOnHand(s, book(100))).toBe(0);
  });

  it('falls back to stored stock when maxPrint is not a finite baseline', () => {
    const s = state({ stock: 42, hist: [sale(2)] });
    expect(deriveOnHand(s, {})).toBe(40);
  });
});
