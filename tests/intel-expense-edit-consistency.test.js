import { describe, it, expect } from 'vitest';
import { runIntelTool } from '../src/lib/publisher-intel-tools.js';

// An approved AI edit to an expense amount/currency must leave the CAD figure
// and the orig* fields (read first by the Edit Expense form and the ledger)
// consistent with each other.

function ctxWith(expense) {
  return {
    books: { hound: { title: 'The Hound', author: 'A', currency: '$', listPrice: 20 } },
    states: { hound: { stock: 1, sold: 0, revenue: 0, hist: [], ledger: [], stores: [], expenses: [{ id: 'x1', desc: 'Fee', cat: 'Events', date: '2026-06-14', ...expense }] } },
    taxCenter: { settings: { baseCurrency: 'CAD' }, tripBudgets: {}, businessExpenses: [] },
    tripsSummary: {},
  };
}
function edit(expense, field, value) {
  const out = runIntelTool('proposeEdits', {
    summary: 't',
    edits: [{ target: 'bookExpense', id: 'x1', bookId: 'hound', field, value }],
  }, ctxWith(expense));
  return out.batch.items[0];
}

describe('expense edits keep CAD and original fields consistent', () => {
  it('uses the old implied rate for a US$ book expense, never 1:1', () => {
    expect(edit({ amount: 100, currency: 'USD', baseAmount: 135 }, 'amount', '200').sidePatch.baseAmount).toBe(270);
  });

  it('clears the CAD figure rather than guessing when no rate is implied', () => {
    expect(edit({ amount: 0, currency: 'USD', baseAmount: 1 }, 'amount', '50').sidePatch)
      .toMatchObject({ baseAmount: null, fxMissing: true });
  });

  it('moves origAmount with amount and clears amountUnknown', () => {
    expect(edit({ amount: 10, origAmount: 10, amountUnknown: true, currency: 'CAD', baseAmount: 10 }, 'amount', '25').sidePatch)
      .toMatchObject({ origAmount: 25, amountUnknown: false, baseAmount: 25 });
  });

  it('moves origCurrency with currency, even with no CAD figure', () => {
    expect(edit({ amount: 10, currency: 'CAD', origCurrency: 'CAD' }, 'currency', 'USD').sidePatch)
      .toEqual({ origCurrency: 'USD' });
  });
});
