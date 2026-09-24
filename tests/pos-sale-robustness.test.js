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

describe('Fair Mode on a phone', () => {
  function cart(lines) {
    win.posSetCurrency('CAD');
    for (const [bookId, qty] of Object.entries(lines)) win.posUpdateQty(bookId, qty);
  }

  it('records the sale the moment a way to pay is tapped — no confirm dialog', async () => {
    cart({ [HARBOUR]: 2 });
    await win.fairCharge('Card');
    await app.settle();
    expect(state(HARBOUR).hist).toHaveLength(1);
    expect(state(HARBOUR).hist[0]).toMatchObject({ qty: 2, chan: 'Book Fair', notes: 'Card' });
    expect(state(HARBOUR).stock).toBe(98);
    expect(document.getElementById('m-pos-sale-confirm').style.display).not.toBe('flex');
    expect(document.getElementById('fm-undo').hidden).toBe(false);
  });

  it('a double tap on the payment button still records once', async () => {
    cart({ [HARBOUR]: 1 });
    await Promise.all([win.fairCharge('Card'), win.fairCharge('Card')]);
    await app.settle();
    expect(state(HARBOUR).hist).toHaveLength(1);
  });

  it('Undo puts every book in the checkout back and takes the money out', async () => {
    cart({ [HARBOUR]: 1, [FABLE]: 2 });
    await win.fairCharge('Stripe QR');
    await app.settle();
    expect(state(FABLE).stock).toBe(48);
    await win.fairUndoLastSale();
    await app.settle();
    for (const id of [HARBOUR, FABLE]) {
      expect(state(id).hist[0].voided).toBe(true);
      expect(state(id).revenue).toBe(0);
      expect(state(id).sold).toBe(0);
    }
    expect(state(HARBOUR).stock).toBe(100);
    expect(state(FABLE).stock).toBe(50);
    expect(app.main.activeBook).toBe(HARBOUR);
  });

  it('Undo cannot reach a sale once its window has passed, or twice', async () => {
    let t = Date.parse('2026-09-20T10:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => t);
    cart({ [HARBOUR]: 1 });
    await win.fairCharge('Card');
    await app.settle();
    t += 60_000;
    await win.fairUndoLastSale();
    expect(state(HARBOUR).hist[0].voided).toBeFalsy();
    expect(state(HARBOUR).stock).toBe(99);

    cart({ [HARBOUR]: 1 });
    await win.fairCharge('Card');
    await app.settle();
    await win.fairUndoLastSale();
    await win.fairUndoLastSale();
    expect(state(HARBOUR).hist.filter(h => h.voided)).toHaveLength(1);
    expect(state(HARBOUR).stock).toBe(99);
  });
});

describe('Fair Mode with patchy signal', () => {
  function cart(lines) {
    win.posSetCurrency('CAD');
    for (const [bookId, qty] of Object.entries(lines)) win.posUpdateQty(bookId, qty);
  }
  const offline = (v) => Object.defineProperty(win.navigator, 'onLine', { configurable: true, get: () => !v });
  afterEach(() => offline(false));

  it('with no signal, QR points to the printed code and records a sale to check', async () => {
    offline(true);
    cart({ [HARBOUR]: 1 });
    win.fairOpenCharge();
    await win.fairShowQR();
    expect(document.getElementById('fm-qr-offline').hidden).toBe(false);
    expect(state(HARBOUR).hist).toHaveLength(0);
    await win.fairCharge('Stripe QR', { printedQr: true });
    await app.settle();
    expect(state(HARBOUR).hist[0].notes).toMatch(/Stripe QR \(printed code, check it arrived in Stripe\)/);
    expect(state(HARBOUR).stock).toBe(99);
  });

  it("shows today's register takings and voids one sale from the list", async () => {
    cart({ [HARBOUR]: 1, [FABLE]: 1 });
    await win.fairCharge('Card');
    await app.settle();
    cart({ [HARBOUR]: 2 });
    await win.fairCharge('Card');
    await app.settle();
    expect(document.getElementById('fm-today-sum').textContent).toMatch(/^2 sales · /);
    win.fairOpenToday();
    expect(document.querySelectorAll('#fm-today-list .fm-today-sale')).toHaveLength(2);

    const firstNum = state(FABLE).hist[0].num;
    const voiding = win.fairVoidSale(firstNum);
    await app.answerConfirm(true);
    await voiding;
    await app.settle();
    expect(state(FABLE).hist[0].voided).toBe(true);
    expect(state(FABLE).stock).toBe(50);
    expect(state(HARBOUR).hist.find((h) => h.num === firstNum).voided).toBe(true);
    expect(state(HARBOUR).stock).toBe(98);
    expect(document.getElementById('fm-today-sum').textContent).toMatch(/^1 sale · /);
  });

  it('the upload pill reads the real queue', () => {
    offline(true);
    win.dispatchEvent(new win.Event('offline'));
    expect(document.getElementById('fm-sync').textContent).toMatch(/^No signal/);
  });
});

describe('Fair Mode, a whole fair day', () => {
  function cart(lines) {
    win.posSetCurrency('CAD');
    for (const [bookId, qty] of Object.entries(lines)) win.posUpdateQty(bookId, qty);
  }
  afterEach(() => { try { localStorage.removeItem('lm-fair-current'); } catch (_) {} });

  it('labels sales with the fair and sums the day by payment and book', async () => {
    const naming = win.fairSetName();
    await new Promise((r) => setTimeout(r, 0));
    document.getElementById('m-prompt-input').value = 'Toronto Art Book Fair';
    document.getElementById('m-prompt-ok').click();
    await naming;
    expect(document.getElementById('fm-fair-name').textContent).toBe('Toronto Art Book Fair');

    cart({ [HARBOUR]: 2 });
    await win.fairCharge('Card');
    await app.settle();
    cart({ [FABLE]: 1 });
    await win.fairCharge('Stripe QR');
    await app.settle();
    expect(state(HARBOUR).hist[0].notes).toBe('Card · Toronto Art Book Fair');

    win.fairOpenSummary();
    const body = document.getElementById('fm-summary-body').textContent;
    expect(document.getElementById('fm-summary-title').textContent).toBe('End of day · Toronto Art Book Fair');
    expect(body).toMatch(/Card reader/);
    expect(body).toMatch(/QR \/ Stripe/);
    expect(body).toMatch(/Harbour Lights.*2 sold · 98 left/);
    expect(body).toMatch(/3 books in 2 sales/);
  });
});

describe('printed QR sales on the To-do list', () => {
  it('tapping Paid on the To-do line marks every book in that checkout as paid', async () => {
    Object.defineProperty(win.navigator, 'onLine', { configurable: true, get: () => false });
    try {
      win.posSetCurrency('CAD');
      win.posUpdateQty(HARBOUR, 1);
      win.posUpdateQty(FABLE, 1);
      await win.fairCharge('Stripe QR', { printedQr: true });
      await app.settle();
    } finally {
      Object.defineProperty(win.navigator, 'onLine', { configurable: true, get: () => true });
    }
    const num = state(HARBOUR).hist[0].num;
    const btn = document.createElement('button');
    Object.assign(btn.dataset, { fix: 'action', fixTab: 'qr-arrived', fixBook: HARBOUR, fixNum: num });
    document.body.append(btn);
    btn.click();
    await app.settle();
    expect(state(HARBOUR).hist[0].qrConfirmed).toBe(true);
    expect(state(FABLE).hist[0].qrConfirmed).toBe(true);
    btn.remove();
  });
});
