// The register at a fair: bad signal, a hurried double tap, several books in
// one checkout. Driven through the real app, like sale-recording-behaviour.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const HARBOUR = 'harbour';
const FABLE = 'fable';
const books = [
  makeBook({ id: HARBOUR, title: 'Harbour Lights', currency: 'CA$', listPrice: 40, maxPrint: 100 }),
  makeBook({ id: FABLE, title: 'Small Fables', currency: 'CA$', listPrice: 25, maxPrint: 50 }),
];

let app;
let win;
const state = (id) => app.main.states[id];

function fillCart(lines, method = 'Cash') {
  win.posSetCurrency('CAD');
  for (const [bookId, qty] of Object.entries(lines)) win.posUpdateQty(bookId, qty);
  document.getElementById('pos-payment-method').value = method;
  win.posCheckout();
}

beforeAll(async () => {
  app = await loadApp({ books });
  win = app.window;
}, 30000);

beforeEach(async () => {
  await app.resetBook(HARBOUR, {});
  await app.resetBook(FABLE, {});
  if (app.main.activeBook !== HARBOUR) win.switchBook(HARBOUR);
});

afterEach(() => { vi.restoreAllMocks(); });

describe('the register holds up at a busy fair', () => {
  it('records a sale once, even when Complete Sale is tapped twice', async () => {
    fillCart({ [HARBOUR]: 1 });
    const first = win.posConfirmSale();
    const second = win.posConfirmSale();
    await Promise.all([first, second]);
    await app.settle();
    expect(state(HARBOUR).hist).toHaveLength(1);
    expect(state(HARBOUR).stock).toBe(99);
  });

  it('records the sale straight away, even when the connection hangs', async () => {
    // A catalogue load that never answers — a fair with one bar of signal.
    const never = new Promise(() => {});
    const original = win._fbLoadCatalog;
    win._fbLoadCatalog = () => never;
    try {
      fillCart({ [HARBOUR]: 2 });
      win.posConfirmSale(); // deliberately not awaited
      await new Promise(r => setTimeout(r, 0));
      expect(state(HARBOUR).hist).toHaveLength(1);
      expect(state(HARBOUR).hist[0]).toMatchObject({ qty: 2, chan: 'Book Fair' });
      expect(state(HARBOUR).stock).toBe(98);
    } finally {
      win._fbLoadCatalog = original;
    }
  });

  it('gives every book in one checkout the same sale number', async () => {
    // Time moves on between rows — each row repaints the screen.
    let t = Date.parse('2026-09-20T10:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 1500));
    fillCart({ [HARBOUR]: 1, [FABLE]: 1 }, 'Card');
    await win.posConfirmSale();
    await app.settle();
    const a = state(HARBOUR).hist[0].num;
    const b = state(FABLE).hist[0].num;
    expect(a).toMatch(/^POS-/);
    expect(a).toBe(b);
  });

  it('leaves the screen on the book it started on', async () => {
    fillCart({ [HARBOUR]: 1, [FABLE]: 1 });
    await win.posConfirmSale();
    await app.settle();
    expect(app.main.activeBook).toBe(HARBOUR);
  });
});

describe('register-only books', () => {
  it('counts a register-only book without touching the catalogue ledger', async () => {
    win.openPosBookModal();
    document.getElementById('pb-title').value = 'Fair Zine';
    document.getElementById('pb-price').value = '10';
    await win.savePosBook();
    await app.settle();
    const extras = () => app.cloud.catalog?._posExtra || {};
    const id = Object.keys(extras()).find(k => extras()[k].title === 'Fair Zine');
    expect(id).toBeTruthy();

    fillCart({ [id]: 2, [HARBOUR]: 1 });
    await win.posConfirmSale();
    await app.settle();

    // The tally reaches the cloud catalogue…
    expect(extras()[id]).toMatchObject({ sold: 2, revenue: 20 });
    // The catalogue book in the same cart is recorded normally.
    expect(state(HARBOUR).hist).toHaveLength(1);
  });
});
