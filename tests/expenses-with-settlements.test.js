import { describe, it, expect } from 'vitest';
import { expensesRepaidBySettlement, expensesWithSettlements } from '../src/lib/receipt-storage.js';
import { expenseLedgerTotals } from '../src/lib/expense-totals.js';

// An author settlement pays expenses back by listing them on its own record;
// every screen reads them through expensesWithSettlements.
const settlement = (id, ids, over = {}) => ({ id, date: '2026-10-08', amount: 10, settlement: { expenses: ids.map(x => ({ id: x, amount: 5 })) }, ...over });

describe('expenses paid back by a settlement', () => {
  it('reads as received on the settlement date while it stands', () => {
    const state = {
      expenses: [{ id: 1, amount: 5 }, { id: 2, amount: 7 }, { id: 3, amount: 4, received: true, receivedDate: '2026-01-02' }],
      artistPayouts: [settlement('s1', [1, 3]), { id: 'plain', amount: 50 }],
    };
    const view = expensesWithSettlements(state);
    expect(view[0]).toEqual({ id: 1, amount: 5, received: true, receivedDate: '2026-10-08', settlementId: 's1' });
    expect(view[1]).toBe(state.expenses[1]);
    expect(view[2]).toBe(state.expenses[2]); // paid by hand: left as stored
    expect(state.expenses[0]).toEqual({ id: 1, amount: 5 }); // never written
  });

  it('ignores an undone settlement, and returns the stored list when nothing applies', () => {
    const state = { expenses: [{ id: 1, amount: 5 }], artistPayouts: [settlement('s1', [1], { voided: true })] };
    expect(expensesWithSettlements(state)).toBe(state.expenses);
    expect(expensesRepaidBySettlement(state.artistPayouts).size).toBe(0);
    expect(expensesWithSettlements({})).toEqual([]);
  });

  it('moves the expense ledger footer from outstanding to reimbursed', () => {
    const state = { expenses: [{ id: 1, amount: 5, currency: 'CAD' }], artistPayouts: [settlement('s1', [1])] };
    expect(expenseLedgerTotals(state.expenses, 'CAD')[0]).toMatchObject({ outstanding: 5, settled: 0 });
    expect(expenseLedgerTotals(expensesWithSettlements(state), 'CAD')[0]).toMatchObject({ outstanding: 0, settled: 5 });
  });
});
