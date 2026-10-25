// Money added in whole cents (src/lib/cents.js), and the totals that use it.
import { describe, it, expect, beforeAll } from 'vitest';
import { toCents, fromCents, sumMoney, lineTotal } from '../src/lib/cents.js';
import { roundCents } from '../src/lib/money.js';
import { loadApp, makeBook } from './helpers/load-app.js';

describe('cents helpers', () => {
  it('adds without floating-point drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney(Array(1000).fill(0.01))).toBe(10);
    expect(sumMoney(Array(3).fill(19.99))).toBe(59.97);
  });

  it('reads amounts saved as text instead of joining them', () => {
    expect(0 + '12.50' + '7.50').toBe('012.507.50');
    expect(sumMoney(['12.50', '7.50'])).toBe(20);
    expect(sumMoney([{ amount: '12.50' }, { amount: 7.5 }, { amount: null }, {}], e => e.amount)).toBe(20);
  });

  it('counts anything that is not a number as zero', () => {
    expect(sumMoney(['abc', undefined, NaN, Infinity, 5])).toBe(5);
    expect(sumMoney([])).toBe(0);
    expect(sumMoney(null)).toBe(0);
  });

  it('agrees with roundCents for every amount', () => {
    for (const x of [0, 1.005, 2.675, -1.005, 19.99, 0.125, 1234567.891, -0.004, 1e-9]) {
      expect(fromCents(toCents(x))).toBe(roundCents(x));
    }
  });

  it('equals roundCents of the plain sum for amounts typed to the cent', () => {
    const amounts = [24.99, 12.5, 0.07, 1999.95, 3.33, 8, 0.01];
    expect(sumMoney(amounts)).toBe(roundCents(amounts.reduce((a, b) => a + b, 0)));
  });

  it('multiplies copies by price to the cent, text or not', () => {
    expect(lineTotal(3, 19.99)).toBe(59.97);
    expect(lineTotal('2', '24.50')).toBe(49);
    expect(lineTotal(undefined, 10)).toBe(0);
  });
});

describe('book cards on All books', () => {
  let app;
  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'bk', title: 'Text Amounts', currency: 'CAD' })] });
  }, 30000);

  it('totals expenses and store balances that came back from a Sheet as text', async () => {
    await app.resetBook('bk', {
      expenses: [{ id: 'e1', amount: '12.50' }, { id: 'e2', amount: '7.50' }],
      stores: [{ id: 1, name: 'A', amountOwed: '30.25' }, { id: 2, name: 'B', amountOwed: 0.1 }, { id: 3, name: 'C', amountOwed: 0.2 }],
    });
    app.window.updateAllOverview();
    const card = [...app.window.document.querySelectorAll('#all-books-list .bsk')]
      .map(el => el.textContent.replace(/\s+/g, ' ').trim());
    expect(card).toContain('CA$20 Expenses');
    expect(card).toContain('CA$31 Owed');
  });
});
