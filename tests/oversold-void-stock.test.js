// A sale for more copies than were on hand only takes what was there (stock
// never goes below zero). Voiding it must put back exactly those copies — not
// the full quantity, which would invent stock that never existed for a book
// with no print run on record. Same for the author's own pile.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { authorStockToReturn, deductSaleFromStockBreakdown, stockToReturn, takeSaleStock } from '../src/lib/inventory.js';

const LOOSE = 'loose';
let app;
let ledger;
const state = () => app.main.states[LOOSE];
const book = () => app.main.BOOKS[LOOSE];

beforeAll(async () => {
  // No print run recorded: on-hand is just the stored count.
  app = await loadApp({ books: [makeBook({ id: LOOSE, title: 'Loose Leaves', maxPrint: undefined })] });
  ledger = await import('../src/features/sales-ledger.js');
}, 30000);

beforeEach(async () => {
  await app.resetBook(LOOSE, { stock: 1, authorStock: 1 });
  if (app.main.activeBook !== LOOSE) app.window.switchBook(LOOSE);
});

describe('voiding an oversold sale', () => {
  it('gives back only the copies that were on the shelf', () => {
    const row = ledger.writeOrderToLedger(LOOSE, { num: 'A-1', chan: 'Direct', qty: 3, price: 10 });
    expect(state().stock).toBe(0);
    expect(row.stockTaken).toBe(1);
    ledger.voidHistEntry(state(), book(), row);
    expect(state().stock).toBe(1);
  });

  it('re-takes against the shelf on un-void and voids back to the same count', () => {
    const row = ledger.writeOrderToLedger(LOOSE, { num: 'A-2', chan: 'Direct', qty: 3, price: 10 });
    ledger.voidHistEntry(state(), book(), row);
    state().stock = 5; // copies found since
    ledger.unvoidHistEntry(state(), book(), row);
    expect(state().stock).toBe(2);
    expect(row.stockTaken).toBeUndefined();
    ledger.voidHistEntry(state(), book(), row);
    expect(state().stock).toBe(5);
  });

  it("gives the author back only what came from the author's pile", () => {
    const row = ledger.writeOrderToLedger(LOOSE, { num: 'A-3', chan: 'Direct', qty: 3, price: 10, enteredBy: 'Artist' });
    expect(state().authorStock).toBe(0);
    expect(row.authorTaken).toBe(1);
    ledger.voidHistEntry(state(), book(), row);
    expect(state().authorStock).toBe(1);
    expect(state().stock).toBe(1);
  });

  it('a direct-to-artist sale held for transfer reverses the same way', () => {
    ledger.recordOrderPendingTransfer('A-4', 'Direct', 3, 10, '');
    const row = state().hist[0];
    expect(row).toMatchObject({ stockTaken: 1, authorTaken: 1 });
    ledger.voidHistEntry(state(), book(), row);
    expect(state().stock).toBe(1);
    expect(state().authorStock).toBe(1);
  });
});

describe('the stock helpers', () => {
  it('older rows without a record give back their full quantity', () => {
    expect(stockToReturn({ qty: 4 })).toBe(4);
    expect(authorStockToReturn({ qty: 4 })).toBe(4);
  });
  it('a sale fully covered by stock records nothing extra', () => {
    const s = { stock: 5 };
    const h = {};
    expect(takeSaleStock(s, h, 2)).toBe(2);
    expect(s.stock).toBe(3);
    expect('stockTaken' in h).toBe(false);
  });
  it("reports how many copies came from the author's pile", () => {
    const s = { authorStock: 2 };
    expect(deductSaleFromStockBreakdown(s, 5, true)).toBe(2);
    expect(s.authorStock).toBe(0);
  });
});
