import { describe, it, expect } from 'vitest';
import { consignmentLedgerTotals } from '../src/lib/consignment.js';

// The consignment ledger exists to answer "how much do the stores still owe
// me". Getting this sum wrong is worse than not showing it — the publisher
// would chase the wrong amount, or stop chasing one that is genuinely unpaid.

const sale = (over = {}) => ({
  id: 1, type: 'Sale', storeName: 'Broadway Books',
  qty: 3, rate: 40, amountDue: 54, status: 'pending', cur: 'CAD',
  ...over,
});

describe('consignmentLedgerTotals', () => {
  it('separates what is still owed from what has been paid', () => {
    const [t] = consignmentLedgerTotals([
      sale({ id: 1, amountDue: 54, status: 'pending' }),
      sale({ id: 2, amountDue: 234, status: 'paid' }),
      sale({ id: 3, amountDue: 9, status: 'paid' }),
    ], 'CAD');

    expect(t.outstanding).toBe(54);
    expect(t.paid).toBe(243);
    expect(t.outstandingCount).toBe(1);
    expect(t.paidCount).toBe(2);
  });

  it('ignores voided rows', () => {
    // A void did not move money. Counting it would overstate what a store owes
    // and send the publisher after a payment that was never due.
    const [t] = consignmentLedgerTotals([
      sale({ id: 1, amountDue: 54, status: 'pending' }),
      sale({ id: 2, amountDue: 500, status: 'pending', voided: true }),
    ], 'CAD');

    expect(t.outstanding).toBe(54);
    expect(t.outstandingCount).toBe(1);
  });

  it('ignores shipments and returns, which never carry an amount due', () => {
    const totals = consignmentLedgerTotals([
      { type: 'Shipment', qty: 20, amountDue: 0, status: 'sent' },
      { type: 'Return', qty: 2, amountDue: 0, status: 'restocked' },
      { type: 'Return', qty: 1, amountDue: 0, status: 'written off' },
    ], 'CAD');

    expect(totals).toEqual([]);
  });

  it('keeps each currency in its own bucket instead of summing across them', () => {
    // Adding CA$ to € produces a number that is wrong in both. This is the same
    // rule the History table follows.
    const totals = consignmentLedgerTotals([
      sale({ id: 1, amountDue: 54, status: 'pending', cur: 'CAD' }),
      sale({ id: 2, amountDue: 30, status: 'pending', cur: 'EUR' }),
      sale({ id: 3, amountDue: 20, status: 'paid', cur: 'EUR' }),
    ], 'CAD');

    expect(totals).toHaveLength(2);
    const byCode = Object.fromEntries(totals.map(t => [t.code, t]));
    expect(byCode.CAD.outstanding).toBe(54);
    expect(byCode.EUR.outstanding).toBe(30);
    expect(byCode.EUR.paid).toBe(20);
  });

  it("lists the book's own currency first, then the rest alphabetically", () => {
    // Stable order across renders — ledger insertion order would reshuffle the
    // footer every time a sale was added.
    const totals = consignmentLedgerTotals([
      sale({ id: 1, amountDue: 10, cur: 'USD' }),
      sale({ id: 2, amountDue: 10, cur: 'EUR' }),
      sale({ id: 3, amountDue: 10, cur: 'CAD' }),
    ], 'CAD');

    expect(totals.map(t => t.code)).toEqual(['CAD', 'EUR', 'USD']);
  });

  it('treats a row with no currency stamp as the book currency', () => {
    // Rows minted before the currency stamp existed have no `cur`, and they
    // were recorded in whatever the book was priced in at the time.
    const totals = consignmentLedgerTotals([
      { type: 'Sale', amountDue: 40, status: 'pending' },
      sale({ id: 2, amountDue: 14, status: 'pending', cur: 'CAD' }),
    ], 'CAD');

    expect(totals).toHaveLength(1);
    expect(totals[0].code).toBe('CAD');
    expect(totals[0].outstanding).toBe(54);
  });

  it('returns nothing for an empty or missing ledger rather than throwing', () => {
    expect(consignmentLedgerTotals([], 'CAD')).toEqual([]);
    expect(consignmentLedgerTotals(null, 'CAD')).toEqual([]);
    expect(consignmentLedgerTotals(undefined, 'CAD')).toEqual([]);
  });

  it('skips malformed rows instead of poisoning the total with NaN', () => {
    // One bad row must not turn the whole figure into "NaN" on screen.
    const [t] = consignmentLedgerTotals([
      sale({ id: 1, amountDue: 54, status: 'pending' }),
      null,
      sale({ id: 2, amountDue: 'not a number', status: 'pending' }),
      sale({ id: 3, amountDue: undefined, status: 'pending' }),
    ], 'CAD');

    expect(t.outstanding).toBe(54);
    expect(Number.isFinite(t.outstanding)).toBe(true);
  });

  it('ignores a sale whose status is neither paid nor pending', () => {
    const totals = consignmentLedgerTotals([
      sale({ id: 1, amountDue: 54, status: 'sent' }),
    ], 'CAD');

    expect(totals).toEqual([]);
  });
});
