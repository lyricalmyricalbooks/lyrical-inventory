// Approving an author submission must not record it twice, even after a reload,
// when the first approval wrote the ledger but could not delete the queue entry.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'harbour';
let app;
beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: BOOK })] });
  if (app.main.activeBook !== BOOK) app.window.switchBook(BOOK);
}, 30000);

function queueSale(subKey) {
  app.window.authorSubmissions[BOOK] = {
    sales: {
      [subKey]: { data: JSON.stringify({ num: 'A-1', chan: 'Website', qty: 2, price: 10, notes: '', date: '2025-03-01' }) },
    },
    expenses: {
      e1: { data: JSON.stringify({ id: 'exp-1', date: '2025-03-01', cat: 'Printing', desc: 'Proofs', amount: 30 }) },
    },
  };
}

describe('approveSubmission after a failed queue delete', () => {
  it('does not record the same sale twice, even after the in-session guard is gone', async () => {
    const s = await app.resetBook(BOOK, { stock: 100 });
    queueSale('s1');
    app.window._fbDeleteSubmission = vi.fn(async () => false);
    await app.window.approveSubmission('sales', 's1');
    expect(s.hist.filter(h => h.num === 'A-1')).toHaveLength(1);
    expect(s.hist[0].fromSubmission).toBe('sales:s1');
    const stockAfterFirst = s.stock;

    // A reload forgets the in-memory guard but the ledger row remembers.
    app.main.states[BOOK].hist = JSON.parse(JSON.stringify(s.hist));
    app.window._fbDeleteSubmission = vi.fn(async () => true);
    await app.window.approveSubmission('sales', 's1');
    expect(app.main.states[BOOK].hist.filter(h => h.num === 'A-1')).toHaveLength(1);
    expect(app.main.states[BOOK].stock).toBe(stockAfterFirst);
    expect(app.window._fbDeleteSubmission).toHaveBeenCalledTimes(1); // leftover cleared
  });

  it('does not duplicate an expense whose ledger row carries the submission key', async () => {
    const s = await app.resetBook(BOOK, {
      expenses: [{ id: 'exp-1', date: '2025-03-01', cat: 'Printing', desc: 'Proofs', amount: 30, fromSubmission: 'expenses:e1' }],
    });
    queueSale('s2');
    app.window._fbDeleteSubmission = vi.fn(async () => true);
    await app.window.approveSubmission('expenses', 'e1');
    expect(app.main.states[BOOK].expenses).toHaveLength(1);
    expect(s.expenses).toHaveLength(1);
  });
});
