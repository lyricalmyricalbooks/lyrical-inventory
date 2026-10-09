// Which Stripe payments become sales without a button press.
import { describe, it, expect } from 'vitest';
import { describeCardSales, stripeSalePlan, paidUnitPrice, wholeCopies } from '../src/lib/stripe-sale-autorecord.js';

const book = { id: 'hound', title: 'The Hound', listPrice: 25 };
const payment = (extra = {}) => ({ id: 'ch_1', amount: 50, currency: 'CAD', created: 2000, ...extra });
const direct = { kind: 'direct', bookId: 'hound' };
const opts = (extra = {}) => ({ classification: direct, book, bookCurrency: 'CAD', autoSince: 1000, ...extra });

describe('a book payment that can be recorded on its own', () => {
  it('uses a resolved conversion to count copies without changing the original paid amount', () => {
    const foreign = payment({ currency: 'EUR', amount: 40 });
    expect(stripeSalePlan(foreign, opts({ conversionRate: 1.25 }))).toEqual({ action: 'record', bookId: 'hound', qty: 2 });
    expect(foreign.amount).toBe(40);
    expect(stripeSalePlan(foreign, opts({ conversionRate: 1.3 })).reason).toBe('amount');
    expect(stripeSalePlan(foreign, opts({ conversionRate: Infinity })).reason).toBe('currency');
  });
  it('records a whole number of copies at the book’s price', () => {
    expect(stripeSalePlan(payment(), opts())).toEqual({ action: 'record', bookId: 'hound', qty: 2 });
  });

  it('never touches a payment from before automatic recording began', () => {
    expect(stripeSalePlan(payment({ created: 500 }), opts())).toEqual({ action: 'skip' });
  });

  it('leaves invoices, website orders and anything refunded to their own paths', () => {
    expect(stripeSalePlan(payment(), opts({ classification: { kind: 'invoice', bookId: 'hound' } })).action).toBe('skip');
    expect(stripeSalePlan(payment(), opts({ classification: { kind: 'bigcartel' } })).action).toBe('skip');
    expect(stripeSalePlan(payment({ refunded: true }), opts()).action).toBe('skip');
    expect(stripeSalePlan(payment({ disputed: true }), opts()).action).toBe('skip');
  });

  it('holds a payment that matches a sale already rung up by hand', () => {
    expect(stripeSalePlan(payment(), opts({ likelyLogged: true }))).toEqual({ action: 'review', reason: 'maybe-rung-up' });
  });

  it('holds an amount that is not a whole number of copies', () => {
    expect(stripeSalePlan(payment({ amount: 30 }), opts())).toEqual({ action: 'review', reason: 'amount' });
  });

  it('holds a different currency, a missing price, or a very large order', () => {
    expect(stripeSalePlan(payment({ currency: 'USD' }), opts()).reason).toBe('currency');
    expect(stripeSalePlan(payment(), opts({ book: { ...book, listPrice: 0 } })).reason).toBe('no-price');
    expect(stripeSalePlan(payment({ amount: 25 * 21 }), opts()).reason).toBe('too-many');
  });

  it('raises a card-reader tap with no book, and ignores other untagged charges', () => {
    const none = { kind: 'direct', bookId: null };
    expect(stripeSalePlan(payment({ cardPresent: true }), opts({ classification: none, book: null })))
      .toEqual({ action: 'review', reason: 'no-book' });
    expect(stripeSalePlan(payment(), opts({ classification: none, book: null }))).toEqual({ action: 'skip' });
  });
});

describe('a payment in another currency, counted in the money paid', () => {
  // The sale in the owner's screenshot: a €40 fixed-price link for a CA$55 book.
  const altrove = { id: 'altrove', title: 'Un Fantastico Altrove', listPrice: 55 };
  const linkPay = (extra = {}) => payment({
    currency: 'EUR', amount: 40, description: 'Un Fantastico Altrove (EUR 40.00)',
    metadata: { book_id: 'altrove', sku: 'altrove', override: 'true' }, ...extra,
  });
  const plan = (p, extra = {}) => stripeSalePlan(p, opts({ book: altrove, classification: { kind: 'direct', bookId: 'altrove' }, ...extra }));

  it('records one copy from the price on the app’s own link, whatever the day’s rate', () => {
    expect(plan(linkPay(), { conversionRate: 1.6213 })).toEqual({ action: 'record', bookId: 'altrove', qty: 1 });
    expect(plan(linkPay({ amount: 80 }), { conversionRate: 1.58 })).toEqual({ action: 'record', bookId: 'altrove', qty: 2 });
  });

  it('still waits for a rate, since the ledger keeps the converted total too', () => {
    expect(plan(linkPay())).toEqual({ action: 'review', reason: 'currency' });
  });

  it('holds an amount that is not whole copies at the link’s price', () => {
    expect(plan(linkPay({ amount: 35 }), { conversionRate: 1.6 })).toEqual({ action: 'review', reason: 'amount' });
  });

  it('trusts a price in the description only on the app’s own links', () => {
    const typed = linkPay({ metadata: { book_id: 'altrove' } });
    expect(paidUnitPrice(typed, altrove, 'CAD')).toBe(null);
    expect(plan(typed, { conversionRate: 1.6 })).toEqual({ action: 'review', reason: 'amount' });
    expect(paidUnitPrice(linkPay({ description: 'Un Fantastico Altrove (USD 40.00)' }), altrove, 'CAD')).toBe(null);
  });

  it('uses the price the book was given for that currency', () => {
    const priced = { ...altrove, priceOverrides: { EUR: 40 } };
    expect(paidUnitPrice(payment({ currency: 'EUR', amount: 120 }), priced, 'CAD')).toEqual({ price: 40, source: 'book' });
    expect(stripeSalePlan(payment({ currency: 'EUR', amount: 120 }), opts({ book: priced, conversionRate: 1.6 })))
      .toEqual({ action: 'record', bookId: 'hound', qty: 3 });
  });

  it('counts a door-price link in the book’s own currency at that price', () => {
    const door = payment({ amount: 20, description: 'The Hound (CAD 20.00)', metadata: { override: 'true' } });
    expect(stripeSalePlan(door, opts())).toEqual({ action: 'record', bookId: 'hound', qty: 1 });
  });

  it('counts whole copies to the cent and nothing else', () => {
    expect(wholeCopies(80, 40)).toBe(2);
    expect(wholeCopies(80.01, 40)).toBe(2);
    expect(wholeCopies(80.02, 40)).toBe(0);
    expect(wholeCopies(10, 40)).toBe(0);
    expect(wholeCopies(40, 0)).toBe(0);
  });
});

describe('what the alert says', () => {
  it('names the book and the stock left for one sale', () => {
    const said = describeCardSales([{ action: 'record', qty: 1, bookTitle: 'The Hound', stockLeft: 12 }]);
    expect(said).toMatchObject({ title: 'Card sale recorded', needsYou: false });
    expect(said.detail).toBe('1 × The Hound paid by card and recorded. 12 left in stock.');
  });

  it('sums up several, and says what is waiting', () => {
    const said = describeCardSales([
      { action: 'record', qty: 1 }, { action: 'record', qty: 2 },
      { action: 'review', reason: 'no-book' },
    ]);
    expect(said.title).toBe('2 card sales recorded');
    expect(said.detail).toBe('2 card payments recorded — 3 copies in all. A card payment came in without saying which book it was for.');
    expect(said.needsYou).toBe(true);
  });

  it('asks for help when nothing could be recorded', () => {
    expect(describeCardSales([{ action: 'review', reason: 'amount' }]).title).toBe('A card payment needs you');
  });
});
