// Recording a sale, driven through the real app: the Event POS register and
// the manual order form, then voiding the row again.
//
// Every assertion is on the ledger the sale produces — the history row, stock,
// revenue, per-channel stats, the running "stock after" balance — and on what
// was written to the cloud, so a sale booked at the wrong amount fails here.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const HARBOUR = 'harbour';
const FABLE = 'fable';

const books = [
  makeBook({ id: HARBOUR, title: 'Harbour Lights', currency: 'CA$', listPrice: 40, maxPrint: 100 }),
  makeBook({ id: FABLE, title: 'Small Fables', currency: '€', listPrice: 25, maxPrint: 50 }),
];

// One sale already on the books: 5 × 40 through the website.
const EXISTING = { num: 'W-1', chan: 'Website', qty: 5, price: 40, date: '2026-01-10', cur: 'CAD', after: 95, sheetsId: 'w1' };

let app;
let win;
const state = (id) => app.main.states[id];
const saved = (id) => app.cloud.lastSave(id)?.state;
const todayIso = () => new Date().toISOString().split('T')[0];

async function sellAtRegister(lines, { method = 'Cash', currency = 'CAD' } = {}) {
  win.posSetCurrency(currency);
  for (const [bookId, qty] of Object.entries(lines)) win.posUpdateQty(bookId, qty);
  document.getElementById('pos-payment-method').value = method;
  win.posCheckout();
  const confirmTotal = document.getElementById('pos-confirm-total').textContent;
  await win.posConfirmSale();
  await app.settle();
  return confirmTotal;
}

beforeAll(async () => {
  app = await loadApp({ books });
  win = app.window;
}, 30000);

beforeEach(async () => {
  await app.resetBook(HARBOUR, { hist: [EXISTING], stock: 95, sold: 5, revenue: 200, chStats: { Website: { txns: 1, units: 5, revenue: 200 } } });
  await app.resetBook(FABLE, {});
  // Switching books repaints the whole dashboard, so only when it's needed.
  if (app.main.activeBook !== HARBOUR) win.switchBook(HARBOUR);
});

describe('selling at the Event POS register', () => {
  it('books the sale into history, stock, revenue and channel stats', async () => {
    const total = await sellAtRegister({ [HARBOUR]: 2 });
    expect(total).toBe('CA$80.00');

    const s = state(HARBOUR);
    expect(s.hist).toHaveLength(2);
    expect(s.hist[0]).toMatchObject({
      chan: 'Book Fair', qty: 2, price: 40, notes: 'Cash', date: todayIso(), cur: 'CAD', enteredBy: 'Publisher',
    });
    expect(s.hist[0].num).toMatch(/^POS-\d{6}$/);
    expect(s.hist[0].payment).toMatchObject({ currency: 'CAD', amount: 80, convertedTotal: 80 });
    expect(s.stock).toBe(93);
    expect(s.sold).toBe(7);
    expect(s.revenue).toBe(280);
    expect(s.chStats['Book Fair']).toEqual({ txns: 1, units: 2, revenue: 80 });
    expect(s.chStats.Website).toEqual({ txns: 1, units: 5, revenue: 200 });
  });

  it('carries the running stock balance down the history', async () => {
    await sellAtRegister({ [HARBOUR]: 2 });
    await sellAtRegister({ [HARBOUR]: 1 });
    expect(state(HARBOUR).hist.map(h => h.after)).toEqual([92, 93, 95]);
    expect(state(HARBOUR).stock).toBe(92);
  });

  it('writes the sale to the cloud', async () => {
    await sellAtRegister({ [HARBOUR]: 2 });
    const cloud = saved(HARBOUR);
    expect(cloud.hist[0]).toMatchObject({ chan: 'Book Fair', qty: 2, price: 40, after: 93 });
    expect(cloud.revenue).toBe(280);
    expect(cloud.stock).toBe(93);
  });

  it('empties the cart and says so', async () => {
    await sellAtRegister({ [HARBOUR]: 1 });
    expect(app.toast()).toMatch(/Sale complete/);
    // A second checkout finds nothing to sell.
    win.posCheckout();
    expect(app.toast()).toMatch(/Cart is empty/);
    expect(state(HARBOUR).hist).toHaveLength(2);
  });

  it('books a hand-adjusted price, and notes the change', async () => {
    win.posSetCurrency('CAD');
    win.openPosPriceModal(HARBOUR);
    document.getElementById('pp-price').value = '30';
    win.savePosPrice();
    const total = await sellAtRegister({});
    expect(total).toBe('CA$30.00');
    const row = state(HARBOUR).hist[0];
    expect(row.qty).toBe(1);
    expect(row.price).toBe(30);
    expect(row.notes).toBe('Cash · Price CA$40.00→CA$30.00');
    expect(state(HARBOUR).revenue).toBe(230);
  });

  it('keeps each book in its own currency when one cart spans two', async () => {
    // Offline seed rates: 1 EUR = 1.47 CAD. The fable is priced in euros but
    // the customer pays in dollars.
    const total = await sellAtRegister({ [HARBOUR]: 1, [FABLE]: 2 });
    expect(total).toBe('CA$113.50');

    const fable = state(FABLE);
    expect(fable.hist).toHaveLength(1);
    // Revenue is booked in the book's own currency…
    expect(fable.hist[0]).toMatchObject({ qty: 2, price: 25, cur: 'EUR' });
    expect(fable.revenue).toBe(50);
    expect(fable.stock).toBe(48);
    // …and the cash that changed hands is stamped beside it.
    expect(fable.hist[0].payment.currency).toBe('CAD');
    expect(fable.hist[0].payment.amount).toBeCloseTo(73.5, 6);
    expect(fable.hist[0].payment.rate).toBeCloseTo(1 / 1.47, 6);
    expect(fable.hist[0].payment.convertedTotal).toBe(50);

    // The other line in the same cart went to its own book only.
    expect(state(HARBOUR).revenue).toBe(240);
    expect(state(HARBOUR).hist[0]).toMatchObject({ qty: 1, price: 40 });
    expect(saved(FABLE).revenue).toBe(50);
    expect(saved(HARBOUR).revenue).toBe(240);
  });

  it('returns to the book that was on screen', async () => {
    await sellAtRegister({ [FABLE]: 1 });
    expect(app.main.activeBook).toBe(HARBOUR);
  });
});

describe('recording a sale in the manual order form', () => {
  function fillManual({ qty, price, num = '', chan = 'In Person', payment = 'Payment directly to publisher', notes = '' }) {
    const set = (id, v) => { document.getElementById(id).value = v; };
    set('m-qty', String(qty));
    set('m-price', String(price));
    set('m-num', num);
    set('m-chan', chan);
    set('m-notes', notes);
    set('m-payment-type', payment);
    set('m-price-cur', 'BOOK');
  }

  it('books the sale into history, stock, revenue and channel stats', async () => {
    fillManual({ qty: 3, price: 35, num: 'MAN-77', notes: 'signed' });
    await win.submitManual();
    await app.settle();

    const s = state(HARBOUR);
    expect(s.hist[0]).toMatchObject({
      num: 'MAN-77', chan: 'In Person', qty: 3, price: 35, after: 92,
      notes: 'signed · Payment directly to publisher', date: todayIso(),
    });
    expect(s.hist[0].payment).toMatchObject({ currency: 'CAD', amount: 105 });
    expect(s.stock).toBe(92);
    expect(s.sold).toBe(8);
    expect(s.revenue).toBe(305);
    expect(s.chStats['In Person']).toEqual({ txns: 1, units: 3, revenue: 105 });
    expect(saved(HARBOUR).revenue).toBe(305);
    // The form is cleared for the next order.
    expect(document.getElementById('m-num').value).toBe('');
    expect(document.getElementById('m-qty').value).toBe('1');
  });

  it('records nothing until a payment type is chosen', async () => {
    fillManual({ qty: 1, price: 40, payment: '' });
    await win.submitManual();
    await app.settle();
    expect(state(HARBOUR).hist).toHaveLength(1);
    expect(state(HARBOUR).revenue).toBe(200);
    expect(app.cloud.saves).toHaveLength(0);
    expect(app.toast()).toMatch(/select a payment type/);
  });
});

describe('voiding a sale', () => {
  async function sellThenVoid() {
    await sellAtRegister({ [HARBOUR]: 2 });
    win.openEditHist(0);
    win.voidEntry();
    await app.settle();
  }

  it('keeps the row for the audit trail but takes it out of every total', async () => {
    await sellThenVoid();
    const s = state(HARBOUR);
    expect(s.hist).toHaveLength(2);
    expect(s.hist[0].voided).toBe(true);
    expect(s.stock).toBe(95);
    expect(s.sold).toBe(5);
    expect(s.revenue).toBe(200);
    expect(s.chStats['Book Fair']).toBeUndefined();
    expect(s.chStats.Website).toEqual({ txns: 1, units: 5, revenue: 200 });
    expect(saved(HARBOUR)).toMatchObject({ stock: 95, sold: 5, revenue: 200 });
    expect(saved(HARBOUR).hist[0].voided).toBe(true);
  });

  it('is left out of the year\'s financial revenue', async () => {
    const year = new Date().getFullYear();
    await sellAtRegister({ [HARBOUR]: 2 });
    const before = win.calculateFinancials(year).revenue;
    win.openEditHist(0);
    win.voidEntry();
    await app.settle();
    expect(before - win.calculateFinancials(year).revenue).toBe(80);
  });

  it('puts everything back when the void is undone', async () => {
    await sellThenVoid();
    win.openEditHist(0);
    win.voidEntry();
    await app.settle();
    const s = state(HARBOUR);
    expect(s.hist[0].voided).toBe(false);
    expect(s.stock).toBe(93);
    expect(s.revenue).toBe(280);
    expect(s.chStats['Book Fair']).toEqual({ txns: 1, units: 2, revenue: 80 });
  });

  it('is not counted when the book is loaded from the cloud', async () => {
    // A copy written by another device: a live sale and a voided one, with
    // stale totals that count both. Loading rebuilds them from the rows.
    app.cloud.books[HARBOUR] = JSON.stringify({
      hist: [
        { num: 'V-1', chan: 'Book Fair', qty: 4, price: 40, date: '2026-02-01', cur: 'CAD', voided: true },
        EXISTING,
      ],
      stock: 91, sold: 9, revenue: 360,
      chStats: { Website: { txns: 1, units: 5, revenue: 200 }, 'Book Fair': { txns: 1, units: 4, revenue: 160 } },
    });
    await win.forceSync();
    const s = state(HARBOUR);
    expect(s.stock).toBe(95);
    expect(s.sold).toBe(5);
    expect(s.revenue).toBe(200);
    expect(s.chStats['Book Fair']).toBeUndefined();
    expect(s.hist[1].after).toBe(95);
  });
});
