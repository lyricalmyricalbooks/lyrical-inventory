// A comp at the register (or Fair Mode's Comp button) is a giveaway: the
// copies leave stock, but nothing counts as a sale or as income — and it can
// still be voided like any register sale.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const HARBOUR = 'harbour';
let app;
let win;
const state = () => app.main.states[HARBOUR];

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: HARBOUR, currency: 'CA$', listPrice: 40, maxPrint: 100, productionCost: 500 })] });
  win = app.window;
}, 30000);

beforeEach(async () => {
  await app.resetBook(HARBOUR, { expenses: [] });
  if (app.main.activeBook !== HARBOUR) win.switchBook(HARBOUR);
  for (const el of document.querySelectorAll('.overlay.closing')) {
    el.style.display = 'none';
    el.classList.remove('closing');
  }
});

async function sell(method, qty = 2) {
  win.posSetCurrency('CAD');
  win.posUpdateQty(HARBOUR, qty);
  document.getElementById('pos-payment-method').value = method;
  win.posCheckout();
  await win.posConfirmSale();
  await app.settle();
}

describe('a comp is recorded as a gratuity', () => {
  it('takes the copies out of stock but adds no revenue or sold count', async () => {
    await sell('Comp/Gift', 2);
    const s = state();
    expect(s.hist).toHaveLength(1);
    expect(s.hist[0]).toMatchObject({ qty: 2, price: 0, gratuity: true, chan: 'Book Fair' });
    expect(s.hist[0].payment.amount).toBe(0);
    expect(s.stock).toBe(98);
    expect(s.revenue).toBe(0);
    expect(s.sold).toBe(0);
  });

  it('shows no charge on the confirm dialog', async () => {
    win.posSetCurrency('CAD');
    win.posUpdateQty(HARBOUR, 1);
    document.getElementById('pos-payment-method').value = 'Comp/Gift';
    win.posCheckout();
    expect(document.getElementById('pos-confirm-total').textContent).toMatch(/0\.00/);
    await win.posConfirmSale();
    await app.settle();
  });

  it('voids cleanly from the register, putting the copies back', async () => {
    await sell('Comp/Gift', 2);
    const num = state().hist[0].num;
    const p = win.fairVoidSale(num);
    await app.settle();
    app.answerConfirm(true);
    await p;
    await app.settle();
    expect(state().hist[0].voided).toBe(true);
    expect(state().stock).toBe(100);
    expect(state().revenue).toBe(0);
  });

  it('a paid sale still counts as income', async () => {
    await sell('Cash', 1);
    expect(state().revenue).toBe(40);
    expect(state().hist[0].gratuity).toBeUndefined();
  });

  it('books the comp as a marketing expense at print cost (Julian, 2026-11-04)', async () => {
    await sell('Comp/Gift', 2);
    const s = state();
    const num = s.hist[0].num;
    expect(s.expenses).toHaveLength(1);
    // 500 to print 100 copies = 5.00 a copy, two given away.
    expect(s.expenses[0]).toMatchObject({
      cat: 'Marketing & Advertising', amount: 10, baseAmount: 10, currency: 'CAD',
      ref: num, gratuity: true, comp: true,
    });
    expect(s.revenue).toBe(0);
    expect(app.cloud.lastSave(HARBOUR).state.expenses[0].amount).toBe(10);
  });

  it('voiding the comp takes its expense off, and un-voiding puts it back', async () => {
    await sell('Comp/Gift', 1);
    const h = state().hist[0];
    const p = win.fairVoidSale(h.num);
    await app.settle();
    app.answerConfirm(true);
    await p;
    await app.settle();
    expect(state().expenses).toHaveLength(0);
    const { unvoidHistEntry } = await import('../src/features/sales-ledger.js');
    unvoidHistEntry(state(), app.main.BOOKS[HARBOUR], h);
    expect(state().expenses).toHaveLength(1);
    expect(state().expenses[0].ref).toBe(h.num);
  });

  it('a paid sale books no marketing expense', async () => {
    await sell('Cash', 1);
    expect(state().expenses || []).toHaveLength(0);
  });
});
