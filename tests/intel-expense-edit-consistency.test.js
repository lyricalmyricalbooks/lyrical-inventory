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

describe('an expense an author settlement paid back', () => {
  it('cannot be marked paid back (or not) by hand through the assistant', () => {
    const ctx = ctxWith({ amount: 10, currency: 'CAD' });
    ctx.states.hound.artistPayouts = [{ id: 's1', date: '2026-10-08', amount: 5, settlement: { expenses: [{ id: 'x1', amount: 10 }] } }];
    for (const value of ['true', 'false']) {
      const out = runIntelTool('proposeEdits', { summary: 't', edits: [{ target: 'bookExpense', id: 'x1', bookId: 'hound', field: 'reimbursed', value }] }, ctx);
      expect(out.batch?.items || []).toHaveLength(0);
      expect(JSON.stringify(out)).toContain('paid back in the author settlement of 2026-10-08');
    }
  });
});
