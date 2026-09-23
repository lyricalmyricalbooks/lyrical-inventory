// Which Stripe payments become sales without a button press.
import { describe, it, expect } from 'vitest';
import { describeCardSales, stripeSalePlan } from '../src/lib/stripe-sale-autorecord.js';

const book = { id: 'hound', title: 'The Hound', listPrice: 25 };
const payment = (extra = {}) => ({ id: 'ch_1', amount: 50, currency: 'CAD', created: 2000, ...extra });
const direct = { kind: 'direct', bookId: 'hound' };
const opts = (extra = {}) => ({ classification: direct, book, bookCurrency: 'CAD', autoSince: 1000, ...extra });

describe('a book payment that can be recorded on its own', () => {
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
