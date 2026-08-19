import { describe, it, expect } from 'vitest';
import { expenseLedgerTotals, expenseTotalsCopy } from '../src/lib/expense-totals.js';

// The expense ledger's footer answers "how much am I still out of pocket for
// this book". Getting it wrong is worse than showing nothing: the publisher
// reimburses the wrong amount, or the author chases money that was never owed.
// The specific failure this replaces is a mixed-currency ledger — the form
// offers six currencies and defaults to CAD whatever the book is priced in —
// summed raw and printed under the book's currency symbol.

const exp = (over = {}) => ({
  id: 1, desc: 'Padded envelopes x20', cat: 'Shipping',
  amount: 40, currency: 'CAD', date: '2026-08-01',
  ...over,
});

describe('expenseLedgerTotals', () => {
  it('separates what is still owed from what has been reimbursed', () => {
    const [t] = expenseLedgerTotals([
      exp({ id: 1, amount: 40 }),
      exp({ id: 2, amount: 12.5 }),
      exp({ id: 3, amount: 100, received: true }),
    ], 'CAD');

    expect(t.code).toBe('CAD');
    expect(t.outstanding).toBe(52.5);
    expect(t.outstandingCount).toBe(2);
    expect(t.settled).toBe(100);
    expect(t.settledCount).toBe(1);
  });

  it('keeps each currency in its own bucket instead of summing across them', () => {
    // The bug this exists to stop: CA$40 + US$25 printed as a single "65".
    const totals = expenseLedgerTotals([
      exp({ id: 1, amount: 40, currency: 'CAD' }),
      exp({ id: 2, amount: 25, currency: 'USD' }),
      exp({ id: 3, amount: 10, currency: 'USD', received: true }),
    ], 'CAD');

    expect(totals).toHaveLength(2);
    const byCode = Object.fromEntries(totals.map(t => [t.code, t]));
    expect(byCode.CAD.outstanding).toBe(40);
    expect(byCode.USD.outstanding).toBe(25);
    expect(byCode.USD.settled).toBe(10);
  });

  it('files an expense that never stamped a currency under the book\'s own', () => {
    // Legacy rows predate the currency selector on the form. They were entered
    // in whatever the book was priced in, which is the only honest guess.
    const [t] = expenseLedgerTotals([{ id: 1, amount: 30 }], 'EUR');
    expect(t.code).toBe('EUR');
    expect(t.outstanding).toBe(30);
  });

  it('reads the book\'s currency first and the rest alphabetically', () => {
    // Stable order across re-renders: the footer must not reshuffle when an
    // unrelated expense is logged.
    const totals = expenseLedgerTotals([
      exp({ id: 1, currency: 'USD' }),
      exp({ id: 2, currency: 'GBP' }),
      exp({ id: 3, currency: 'EUR' }),
    ], 'EUR');
    expect(totals.map(t => t.code)).toEqual(['EUR', 'GBP', 'USD']);
  });

  it('leaves gratuity copies out — they are never reimbursed to anyone', () => {
    const totals = expenseLedgerTotals([
      exp({ id: 1, amount: 40 }),
      exp({ id: 2, amount: 999, gratuity: true }),
      exp({ id: 3, amount: 500, ref: 'GRAT-12' }),
      exp({ id: 4, amount: 250, desc: 'Gratuity: two copies to the library' }),
    ], 'CAD');

    expect(totals).toHaveLength(1);
    expect(totals[0].outstanding).toBe(40);
  });

  it('leaves author submissions out until the publisher has accepted them', () => {
    // A row awaiting approval is not in the ledger. Totalling it would promise
    // money against something the publisher may still reject.
    const totals = expenseLedgerTotals([
      exp({ id: 1, amount: 40 }),
      exp({ id: 2, amount: 300, pendingAuth: true }),
    ], 'CAD');

    expect(totals[0].outstanding).toBe(40);
    expect(totals[0].outstandingCount).toBe(1);
  });

  it('totals nothing at all when every row is exempt', () => {
    // No bucket means no footer row, which is what the ledger wants here — a
    // zero total under rows that all read "Publisher expense" says nothing.
    expect(expenseLedgerTotals([exp({ gratuity: true })], 'CAD')).toEqual([]);
    expect(expenseLedgerTotals([], 'CAD')).toEqual([]);
    expect(expenseLedgerTotals(null, 'CAD')).toEqual([]);
  });

  it('does not let repeated small amounts drift the total off the column', () => {
    const rows = Array.from({ length: 3 }, (_, i) => exp({ id: i, amount: 0.1 }));
    const [t] = expenseLedgerTotals(rows, 'CAD');
    expect(t.outstanding).toBe(0.3);
  });
});

describe('expenseTotalsCopy', () => {
  it('names the amount still owed and how many receipts it covers', () => {
    const copy = expenseTotalsCopy({
      code: 'CAD', outstanding: 52.5, outstandingCount: 2, settled: 100, settledCount: 1,
    });
    expect(copy.status).toBe('outstanding');
    expect(copy.label).toBe('Outstanding');
    expect(copy.amount).toBe(52.5);
    expect(copy.sub).toContain('2 expenses not reimbursed');
    expect(copy.sub).toContain('CA$100.00 already reimbursed');
  });

  it('says all-clear outright rather than leaving a bare zero to interpret', () => {
    const copy = expenseTotalsCopy({
      code: 'USD', outstanding: 0, outstandingCount: 0, settled: 80, settledCount: 2,
    });
    expect(copy.status).toBe('clear');
    expect(copy.label).toBe('All reimbursed');
    expect(copy.sub).toContain('nothing outstanding');
    expect(copy.sub).toContain('US$80.00 already reimbursed');
  });

  it('reads as one expense, not "1 expenses"', () => {
    const copy = expenseTotalsCopy({
      code: 'CAD', outstanding: 40, outstandingCount: 1, settled: 0, settledCount: 0,
    });
    expect(copy.sub).toContain('1 expense not reimbursed');
    expect(copy.sub).toContain('nothing reimbursed yet');
  });

  it('keeps the publisher\'s vocabulary out of the copy', () => {
    // The shop owner reads this line, so it must not leak the words the code
    // uses for the same idea.
    const copy = expenseTotalsCopy({
      code: 'CAD', outstanding: 40, outstandingCount: 1, settled: 0, settledCount: 0,
    });
    for (const word of ['Firestore', 'pendingAuth', 'gratuity', 'bucket', 'undefined', 'NaN']) {
      expect(`${copy.label} ${copy.sub}`).not.toContain(word);
    }
  });

  it('survives a bucket with nothing on it rather than printing undefined', () => {
    const copy = expenseTotalsCopy({});
    expect(copy.status).toBe('clear');
    expect(copy.code).toBe('CAD');
    expect(copy.amount).toBe(0);
    expect(copy.sub).not.toContain('undefined');
    expect(copy.sub).not.toContain('NaN');
  });
});
