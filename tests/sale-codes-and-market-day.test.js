import { describe, it, expect } from 'vitest';
import { booksInDescription, saleCodes, splitSalePlan } from '../src/lib/sale-codes.js';
import { describeMarketDay, latestMarketDay, summariseMarketDay } from '../src/lib/market-day.js';
import { storeReversal, storeReversalsToRaise } from '../src/lib/store-reversals.js';
import { refundsToRaise } from '../src/lib/stripe-sale-autorecord.js';

const BOOKS = {
  altrove: { id: 'altrove', title: 'Altrove', listPrice: 25 },
  hound: { id: 'hound', title: 'The Hound of Heaven', listPrice: 30 },
  own: { id: 'own', title: 'Something Long', listPrice: 20, saleCode: 'sl' },
};

describe('short book codes', () => {
  it('gives every book a stable code, honouring one the publisher set', () => {
    const codes = saleCodes(BOOKS);
    expect(codes.altrove).toBe('ALT');
    expect(codes.own).toBe('SL');
    expect(codes.hound).toMatch(/^[A-Z]{3,4}$/);
    expect(saleCodes(BOOKS)).toEqual(codes);
  });

  it('never hands two books the same code', () => {
    const codes = saleCodes({ a: { id: 'a', title: 'Altrove' }, b: { id: 'b', title: 'Altitude' } });
    expect(codes.a).not.toBe(codes.b);
  });
});

describe('reading books from a card-reader description', () => {
  it('reads codes, titles and counts', () => {
    expect(booksInDescription('2 ALT', BOOKS)).toEqual([{ bookId: 'altrove', qty: 2, stated: true }]);
    expect(booksInDescription('altrove', BOOKS)).toEqual([{ bookId: 'altrove', qty: 1, stated: false }]);
    expect(booksInDescription('1 ALT, 2x The Hound of Heaven', BOOKS)).toEqual([
      { bookId: 'altrove', qty: 1, stated: true },
      { bookId: 'hound', qty: 2, stated: true },
    ]);
  });

  it('adds up a book named twice, and finds nothing in an unrelated note', () => {
    expect(booksInDescription('ALT ALT', BOOKS)).toEqual([{ bookId: 'altrove', qty: 2, stated: true }]);
    expect(booksInDescription('tote bag', BOOKS)).toEqual([]);
  });

  it('records several books only when their prices add up to the payment', () => {
    const lines = booksInDescription('1 ALT 2 SL', BOOKS);
    expect(splitSalePlan({ amount: 65, currency: 'CAD' }, lines, BOOKS).action).toBe('record');
    expect(splitSalePlan({ amount: 60, currency: 'CAD' }, lines, BOOKS)).toEqual({ action: 'review', reason: 'amount' });
    expect(splitSalePlan({ amount: 65, currency: 'USD' }, lines, BOOKS, { bookCurrency: () => 'CAD' }).reason).toBe('currency');
  });
});

describe('the morning after a market day', () => {
  const rows = [
    { bookId: 'altrove', entry: { chan: 'Book Fair', date: '2026-09-20', qty: 3, notes: 'Card reader' } },
    { bookId: 'hound', entry: { chan: 'Book Fair', date: '2026-09-20', qty: 1, notes: 'Cash' } },
    { bookId: 'hound', entry: { chan: 'Website', date: '2026-09-21', qty: 1 } },
    { bookId: 'altrove', entry: { chan: 'Book Fair', date: '2026-09-20', qty: 5, voided: true } },
  ];

  it('finds the latest in-person day not yet summarised', () => {
    expect(latestMarketDay(rows, { today: '2026-09-22' })).toBe('2026-09-20');
    expect(latestMarketDay(rows, { today: '2026-09-22', shownFor: '2026-09-20' })).toBe('');
    expect(latestMarketDay(rows, { today: '2026-09-20' })).toBe('');
    expect(latestMarketDay(rows, { today: '2026-10-10' })).toBe('');
  });

  it('adds up the day, leaves out voided sales, and says what needs doing', () => {
    const summary = summariseMarketDay(rows, '2026-09-20', { books: BOOKS, stockOf: id => (id === 'hound' ? 2 : 10), unmatched: 1 });
    expect(summary.copies).toBe(4);
    expect(summary.pay).toEqual({ card: 3, cash: 1, other: 0 });
    const said = describeMarketDay(summary);
    expect(said.detail).toBe('4 copies sold: Altrove 3, The Hound of Heaven 1. Paid 3 by card, 1 cash. 1 card payment still needs a book picked. Running low: The Hound of Heaven (2 left).');
    expect(said.needsYou).toBe(true);
  });
});

describe('store orders reversed after being recorded', () => {
  const order = (id, attributes) => ({ id, attributes });

  it('reads cancelled, refunded and partly refunded orders', () => {
    expect(storeReversal(order('A', { status: 'cancelled' }))).toBe('reversed');
    expect(storeReversal(order('A', { payment_status: 'refunded' }))).toBe('reversed');
    expect(storeReversal(order('A', { payment_status: 'partially_refunded' }))).toBe('partial');
    expect(storeReversal(order('A', { status: 'shipped' }))).toBe('');
  });

  it('finds the recorded row, once', () => {
    const rows = [
      { bookId: 'altrove', entry: { chan: 'Website', num: '#ABCD-1', sheetsId: 'bc-ABCD-1', qty: 2 } },
      { bookId: 'altrove', entry: { chan: 'Website', num: '#ABCD-2', sheetsId: 'bc-ABCD-2', qty: 1, storeReversalNoted: true } },
      { bookId: 'altrove', entry: { chan: 'Website', num: '#ABCD-3', qty: 1 } },
    ];
    const out = storeReversalsToRaise([
      order('ABCD-1', { status: 'cancelled' }),
      order('ABCD-2', { status: 'cancelled' }),
      order('ABCD-3', { status: 'cancelled' }),
    ], rows);
    expect(out).toEqual([{ bookId: 'altrove', sheetsId: 'bc-ABCD-1', num: '#ABCD-1', qty: 2, full: true }]);
  });
});

describe('refunding a card payment that covered several books', () => {
  it('reverses every row of the payment together', () => {
    const sales = [
      { chargeId: 'ch_1', sheetsId: 'stripe-ch_1', qty: 1, paidAmount: 25 },
      { chargeId: 'ch_1', sheetsId: 'stripe-ch_1-2', qty: 2, paidAmount: 40 },
    ];
    const out = refundsToRaise([{ chargeId: 'ch_1', amount: 65 }], sales);
    expect(out.map(o => [o.sheetsId, o.full])).toEqual([['stripe-ch_1', true], ['stripe-ch_1-2', true]]);
    expect(refundsToRaise([{ chargeId: 'ch_1', amount: 25 }], sales).every(o => !o.full)).toBe(true);
  });
});

describe('reading hurried typing at a fair', () => {
  const FAIR = {
    hound: { id: 'hound', title: 'The Hound of Heaven', listPrice: 30 },
    alt: { id: 'alt', title: 'Un Fantastico Altrove', listPrice: 25 },
    honey: { id: 'honey', title: 'Honey', listPrice: 15 },
    houses: { id: 'houses', title: 'Houses', listPrice: 20 },
  };
  const ids = (text) => booksInDescription(text, FAIR).map(line => `${line.qty} ${line.bookId}`);

  it('finds The Hound however it was typed', () => {
    ['thehound', 'the hound', 'hound', 'houn', 'hond', 'hund', 'hounf', 'thehoundofheaven', 'HOUND'].forEach(text => {
      expect(ids(text), text).toEqual(['1 hound']);
    });
  });

  it('reads the start of a title and skips articles like "Un"', () => {
    expect(ids('alt')).toEqual(['1 alt']);
    expect(ids('altro')).toEqual(['1 alt']);
    expect(ids('fantastco')).toEqual(['1 alt']);
  });

  it('reads counts before or after, and several books', () => {
    expect(ids('2 hound, alt')).toEqual(['2 hound', '1 alt']);
    expect(ids('alt+hound x3')).toEqual(['1 alt', '3 hound']);
    expect(ids('2x houn')).toEqual(['2 hound']);
    expect(ids('hound and alt')).toEqual(['1 hound', '1 alt']);
    expect(ids('hound hound')).toEqual(['2 hound']);
  });

  it('prefers the clearer match between look-alike titles', () => {
    expect(ids('hone')).toEqual(['1 honey']);
    expect(ids('hous')).toEqual(['1 houses']);
  });

  it('reads nothing into ordinary words', () => {
    ['cash', 'card', 'tip', 'thanks', 'the', 'market day', 'sale', ''].forEach(text => {
      expect(ids(text), text).toEqual([]);
    });
  });

  it('gives short, typeable codes and settles clashes with a fourth letter', () => {
    const codes = saleCodes(FAIR);
    expect(codes.alt).toBe('FAN');
    expect(new Set(Object.values(codes)).size).toBe(4);
    expect(codes.hound).toBe('HOU');
    expect(codes.houses).toBe('HOUS');
    expect(ids('hous')).toEqual(['1 houses']);
  });
});
