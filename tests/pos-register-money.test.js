// @vitest-environment jsdom
// The register (Event POS), driven through the real app: ring books up, take
// the payment, and check every place the money lands — the book's history
// row, stock, revenue and channel totals, the copy sent to the cloud, and the
// Tax Centre's income figure, which reads the same history.
//
// tests/sale-recording-behaviour.test.js covers one CAD book and a € book
// paid in dollars; this file covers a two-book checkout, a dollar book paid in
// US dollars, a quick discount, and the sale reaching the Tax Centre.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const HARBOUR = 'harbour';
const ORCHARD = 'orchard';

const books = [
  makeBook({ id: HARBOUR, title: 'Harbour Lights', currency: 'CA$', listPrice: 40, maxPrint: 100 }),
  makeBook({ id: ORCHARD, title: 'Orchard Songs', currency: 'CA$', listPrice: 25, maxPrint: 60 }),
];

let app;
let win;
const state = (id) => app.main.states[id];
const saved = (id) => app.cloud.lastSave(id)?.state;

async function ringUp(lines, { method = 'Cash', currency = 'CAD' } = {}) {
  win.posSetCurrency(currency);
  for (const [bookId, qty] of Object.entries(lines)) win.posUpdateQty(bookId, qty);
  document.getElementById('pos-payment-method').value = method;
  win.posCheckout();
  const shownTotal = document.getElementById('pos-confirm-total').textContent;
  await win.posConfirmSale();
  await app.settle();
  return shownTotal;
}

beforeAll(async () => {
  app = await loadApp({ books });
  win = app.window;
}, 30000);

beforeEach(async () => {
  await app.resetBook(HARBOUR, { hist: [], stock: 100, sold: 0, revenue: 0, chStats: {} });
  await app.resetBook(ORCHARD, { hist: [], stock: 60, sold: 0, revenue: 0, chStats: {} });
  if (app.main.activeBook !== HARBOUR) win.switchBook(HARBOUR);
});

describe('ringing up two books in Canadian dollars', () => {
  it('charges the sum of both, and books each title its own share', async () => {
    const total = await ringUp({ [HARBOUR]: 2, [ORCHARD]: 1 }, { method: 'Card' });
    // 2 × 40 + 1 × 25
    expect(total).toBe('CA$105.00');

    expect(state(HARBOUR)).toMatchObject({ stock: 98, sold: 2, revenue: 80 });
    expect(state(ORCHARD)).toMatchObject({ stock: 59, sold: 1, revenue: 25 });
    expect(state(HARBOUR).chStats['Book Fair']).toEqual({ txns: 1, units: 2, revenue: 80 });
    expect(state(ORCHARD).chStats['Book Fair']).toEqual({ txns: 1, units: 1, revenue: 25 });

    const h = state(HARBOUR).hist[0];
    const o = state(ORCHARD).hist[0];
    expect(h).toMatchObject({ chan: 'Book Fair', qty: 2, price: 40, notes: 'Card', cur: 'CAD', after: 98 });
    expect(o).toMatchObject({ chan: 'Book Fair', qty: 1, price: 25, notes: 'Card', cur: 'CAD', after: 59 });
    // One checkout, one sale number on both rows.
    expect(h.num).toBe(o.num);
  });

  it('sends both books to the cloud with the sale on them', async () => {
    await ringUp({ [HARBOUR]: 2, [ORCHARD]: 1 });
    expect(saved(HARBOUR)).toMatchObject({ stock: 98, sold: 2, revenue: 80 });
    expect(saved(HARBOUR).hist[0]).toMatchObject({ qty: 2, price: 40, chan: 'Book Fair' });
    expect(saved(ORCHARD)).toMatchObject({ stock: 59, sold: 1, revenue: 25 });
    expect(saved(ORCHARD).hist[0]).toMatchObject({ qty: 1, price: 25, chan: 'Book Fair' });
  });
});

describe('a Canadian book paid for in US dollars', () => {
  it('books the Canadian price as revenue and stamps the US dollars that changed hands', async () => {
    // The register's built-in rates (no network): 1 USD = 1.36 CAD.
    const total = await ringUp({ [HARBOUR]: 2 }, { currency: 'USD' });
    // CA$80 at 1.36 is US$58.82.
    expect(total).toBe('$58.82');

    const s = state(HARBOUR);
    // The ledger stays in the book's own currency…
    expect(s.revenue).toBe(80);
    expect(s.hist[0]).toMatchObject({ qty: 2, price: 40, cur: 'CAD' });
    // …and the cash taken is kept beside it, in the currency it was paid in.
    expect(s.hist[0].payment.currency).toBe('USD');
    expect(s.hist[0].payment.amount).toBeCloseTo(80 / 1.36, 2);
    expect(s.hist[0].payment.convertedTotal).toBe(80);
    expect(saved(HARBOUR).revenue).toBe(80);
  });
});

describe('a discount at the till', () => {
  it('a 25% quick discount sells at 75% of list and says so on the row', async () => {
    win.posSetCurrency('CAD');
    win.openPosPriceModal(HARBOUR);
    win.posPriceQuick(25);
    expect(document.getElementById('pp-price').value).toBe('30.00');
    expect(document.getElementById('pp-preview').textContent).toContain('25% off');
    win.savePosPrice();
    win.posUpdateQty(HARBOUR, 1); // a second copy at the same price

    const total = await ringUp({});
    expect(total).toBe('CA$60.00');
    const row = state(HARBOUR).hist[0];
    expect(row).toMatchObject({ qty: 2, price: 30 });
    expect(row.notes).toBe('Cash · Price CA$40.00→CA$30.00');
    expect(state(HARBOUR).revenue).toBe(60);
    expect(state(HARBOUR).chStats['Book Fair']).toEqual({ txns: 1, units: 2, revenue: 60 });
  });

  it('the next customer is charged full price again', async () => {
    win.posSetCurrency('CAD');
    win.openPosPriceModal(HARBOUR);
    win.posPriceQuick(50);
    win.savePosPrice();
    await ringUp({});
    await ringUp({ [HARBOUR]: 1 });
    expect(state(HARBOUR).hist.map(h => h.price)).toEqual([40, 20]);
    expect(state(HARBOUR).revenue).toBe(60);
  });
});

describe('the Tax Centre after a register sale', () => {
  it('counts the takings as gross sales, at the Canadian value', async () => {
    await ringUp({ [HARBOUR]: 2, [ORCHARD]: 1 });
    await ringUp({ [ORCHARD]: 1 }, { currency: 'USD' });
    app.main.TAX_CENTER.businessExpenses = [];
    win.switchTab('taxcenter');
    win.renderTaxCenter();
    // 80 + 25 + 25: the US-dollar sale counts at the book's own CA$ price.
    expect(document.getElementById('tc-sales').textContent).toBe('CA$130.00');
    expect(document.getElementById('tc-expenses').textContent).toBe('CA$0.00');
    expect(document.getElementById('tc-net').textContent).toBe('CA$130.00');
  });
});
