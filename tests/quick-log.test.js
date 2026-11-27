// Quick log's own reader: everyday sentences into entries, with no AI.
import { describe, it, expect } from 'vitest';
import {
  readQuickLog, readConfidently, readDate, readMoney, splitClauses, wordsToNumbers,
  checkQuickLogEntry, entriesFromAi, describeEntry, gratuityUsed, quickLogAiPrompt,
} from '../src/lib/quick-log.js';

const books = {
  hound: { id: 'hound', title: 'The Hound of Heaven', listPrice: 30, currency: 'CA$', pubGratuity: 10, authorGratuity: 5 },
  altrove: { id: 'altrove', title: 'Un Fantastico Altrove', listPrice: 25, currency: 'CA$', pubGratuity: 0 },
  sistema: { id: 'sistema', title: 'Sistema', listPrice: 20, currency: '€' },
};
const today = '2026-11-26'; // a Thursday
const categorize = d => (/postage|stamps/i.test(d) ? 'Shipping & Postage' : /lunch/i.test(d) ? 'Meals & Entertainment' : '');
const read = (text, extra = {}) => readQuickLog(text, { books, today, categorize, ...extra });

describe('reading a gratuity', () => {
  it('reads the example from the plan', () => {
    const { entries, unread } = read('log a gratuity for the hound');
    expect(unread).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'gratuity', bookId: 'hound', qty: 1, pile: 'publisher', date: today, expense: false, missing: [] });
  });

  it('reads counts said as words, the pile, the recipient and expensing', () => {
    const { entries } = read("gave two copies of the hound to Sarah at the Star from the author's pile and expense it");
    expect(entries[0]).toMatchObject({ type: 'gratuity', bookId: 'hound', qty: 2, pile: 'author', recipient: 'Sarah at the Star', expense: true });
  });

  it('reads sloppy titles the way the Stripe matcher does', () => {
    expect(read('comp a houn').entries[0].bookId).toBe('hound');
    expect(read('review copy of altrove yesterday').entries[0]).toMatchObject({ bookId: 'altrove', date: '2026-11-25' });
  });

  it('flags a gift that names no book, and uses the book on screen only as a flagged guess', () => {
    expect(read('log a gratuity').entries[0].missing).toEqual(['book']);
    const guessed = read('log a gratuity', { activeBookId: 'sistema' }).entries[0];
    expect(guessed).toMatchObject({ bookId: 'sistema', assumedBook: true });
    expect(readConfidently(read('log a gratuity', { activeBookId: 'sistema' }))).toBe(false);
  });
});

describe('reading a sale', () => {
  it('reads count, book, price each, channel and payment', () => {
    const e = read('sold two altrove at the fair for 22 each cash').entries[0];
    expect(e).toMatchObject({ type: 'sale', bookId: 'altrove', qty: 2, price: 22, channel: 'Book Fair', payment: 'Cash' });
  });

  it('reads a price said for several copies as the total', () => {
    expect(read('sold 2 hound for 50').entries[0]).toMatchObject({ qty: 2, price: 25 });
  });

  it('leaves the price empty (list price) when none is said, and reads card', () => {
    expect(read('sold a hound by card').entries[0]).toMatchObject({ qty: 1, price: null, payment: 'Card', channel: 'In Person' });
  });

  it('reads several books in one sale as one entry each', () => {
    const { entries } = read('sold two altrove and a hound');
    expect(entries.map(e => [e.bookId, e.qty])).toEqual([['altrove', 2], ['hound', 1]]);
  });
});

describe('reading an expense', () => {
  it('reads amount, description and category', () => {
    const e = read('spent 18 dollars on postage at canada post').entries[0];
    expect(e).toMatchObject({ type: 'expense', amount: 18, currency: 'CAD', category: 'Shipping & Postage' });
    expect(e.description).toBe('Postage at canada post');
  });

  it('reads dollars and cents, other currencies and unknown categories', () => {
    expect(read('paid $12.50 for lunch').entries[0]).toMatchObject({ amount: 12.5, category: 'Meals & Entertainment' });
    expect(read('spent twenty five euros on a frame').entries[0]).toMatchObject({ amount: 25, currency: 'EUR', category: 'Other' });
    expect(read('spent 18 dollars and 40 cents on stamps').entries[0].amount).toBe(18.4);
  });

  it('flags an expense with no amount', () => {
    expect(read('bought stamps').entries[0].missing).toContain('amount');
  });
});

describe('several things in one breath', () => {
  it('splits entries on "and" only when a new kind of entry starts', () => {
    expect(splitClauses('gratuity for the hound and sold two altrove')).toEqual(['gratuity for the hound', 'sold two altrove']);
    expect(splitClauses('sold two altrove and a hound')).toEqual(['sold two altrove and a hound']);
    const { entries } = read('gratuity for the hound, sold one sistema for 20, then spent 5 dollars on stamps');
    expect(entries.map(e => e.type)).toEqual(['gratuity', 'sale', 'expense']);
  });

  it('returns what it could not read, so the AI can be asked', () => {
    const r = read('the weather was nice');
    expect(r.entries).toEqual([]);
    expect(r.unread).toEqual(['the weather was nice']);
    expect(readConfidently(r)).toBe(false);
  });
});

describe('helpers', () => {
  it('turns spoken numbers into digits', () => {
    expect(wordsToNumbers('a couple of hound')).toBe('2 hound');
    expect(wordsToNumbers('twenty-five dollars')).toBe('25 dollars');
  });

  it('reads dates, never into the future', () => {
    expect(readDate('on saturday', today)).toBe('2026-11-21');
    expect(readDate('last thursday', today)).toBe('2026-11-19');
    expect(readDate('thursday', today)).toBe(today);
    expect(readDate('november 20', today)).toBe('2026-11-20');
    expect(readDate('december 3', today)).toBe('2025-12-03');
    expect(readDate('nothing', today)).toBe(today);
  });

  it('reads money and does not take a copy count for a price', () => {
    expect(readMoney('for 25 each')).toMatchObject({ amount: 25, each: true });
    expect(readMoney('$18')).toMatchObject({ amount: 18, each: false });
    expect(readMoney('2 copies of the hound')).toBeNull();
  });

  it('counts gift piles like the form does (voided gifts excluded)', () => {
    expect(gratuityUsed([
      { gratuity: true, gratSource: 'publisher', qty: 2 },
      { gratuity: true, gratSource: 'author', qty: 1 },
      { gratuity: true, gratSource: 'publisher', qty: 4, voided: true },
      { qty: 3 },
    ])).toEqual({ publisher: 2, author: 1 });
  });
});

describe('checking an entry before it is logged', () => {
  const states = {
    hound: { stock: 3, hist: [{ gratuity: true, gratSource: 'publisher', qty: 9 }] },
    altrove: { stock: 10, hist: [] },
  };
  const ctx = { books, states, today };

  it('blocks when there are not enough copies, counting rows above it on the card', () => {
    expect(checkQuickLogEntry({ type: 'sale', bookId: 'hound', qty: 4, price: 30 }, ctx).blocking[0]).toMatch(/Only 3 copies/);
    expect(checkQuickLogEntry({ type: 'sale', bookId: 'hound', qty: 2, price: 30 }, { ...ctx, pendingQty: { hound: 2 } }).blocking[0]).toMatch(/Only 1 copy/);
  });

  it('notes a gift pile going over and an odd price, without blocking', () => {
    const g = checkQuickLogEntry({ type: 'gratuity', bookId: 'hound', qty: 2, pile: 'publisher' }, ctx);
    expect(g.blocking).toEqual([]);
    expect(g.notes[0]).toMatch(/1 of 10 left/);
    const s = checkQuickLogEntry({ type: 'sale', bookId: 'altrove', qty: 1, price: 5 }, ctx);
    expect(s.notes[0]).toMatch(/far from the list price/);
  });

  it('blocks a missing book or amount, and notes a future date', () => {
    expect(checkQuickLogEntry({ type: 'gratuity', bookId: '', qty: 1 }, ctx).blocking).toEqual(['Pick the book.']);
    const e = checkQuickLogEntry({ type: 'expense', amount: null, description: 'x', date: '2026-12-01' }, ctx);
    expect(e.blocking[0]).toMatch(/how much/);
    expect(e.notes[0]).toMatch(/future/);
  });
});

describe('the AI reader', () => {
  it('keeps only what the app can use', () => {
    const out = entriesFromAi({ entries: [
      { type: 'gratuity', bookId: 'hound', qty: 2, pile: 'author', recipient: 'Ana' },
      { type: 'sale', bookId: 'not-a-book', qty: 1, price: 20, channel: 'Book Fair' },
      { type: 'refund', bookId: 'hound' },
      { type: 'expense', amount: 9.999, description: 'Tape', category: 'Made up', date: '2030-01-01' },
    ] }, { books, today, categories: ['Office Supplies', 'Other'], categorize: () => 'Office Supplies' });
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ type: 'gratuity', bookId: 'hound', qty: 2, pile: 'author', recipient: 'Ana', missing: [] });
    expect(out[1]).toMatchObject({ type: 'sale', bookId: '', missing: ['book'] });
    expect(out[2]).toMatchObject({ type: 'expense', amount: 10, category: 'Office Supplies', date: today });
  });

  it('gives the AI the catalogue and today', () => {
    const p = quickLogAiPrompt('gift the hound', { books, today, categories: ['Other'] });
    expect(p).toContain('hound: The Hound of Heaven');
    expect(p).toContain(today);
  });
});

it('describes an entry in one readable line', () => {
  expect(describeEntry({ type: 'gratuity', bookId: 'hound', qty: 1, pile: 'publisher' }, books)).toBe("Gratuity · The Hound of Heaven · 1 copy · publisher's pile");
});
