import { describe, it, expect } from 'vitest';
import { checkMarketCards, describeMarketCards } from '../src/lib/market-card-check.js';

const DAY = '2026-09-20';
const pos = (num, amount, extra = {}) => ({
  bookId: 'altrove',
  entry: { chan: 'Book Fair', date: DAY, num, qty: 1, price: amount, notes: 'Card', payment: { amount, currency: 'CAD' }, ...extra },
});

describe('register card sales against the card reader', () => {
  it('agrees when every card sale has its payment', () => {
    expect(checkMarketCards([pos('POS-1', 25)], DAY, [{ id: 'ch_1', amount: 25, currency: 'CAD' }]))
      .toEqual({ missing: [], doubled: [] });
  });

  it('adds up a checkout of several books before comparing', () => {
    const rows = [pos('POS-1', 25), { ...pos('POS-1', 30), bookId: 'hound' }];
    expect(checkMarketCards(rows, DAY, [{ id: 'ch_1', amount: 55, currency: 'CAD' }]).missing).toEqual([]);
  });

  it('flags a card sale with no payment behind it', () => {
    const out = checkMarketCards([pos('POS-1', 25), pos('POS-2', 25)], DAY, [{ id: 'ch_1', amount: 25, currency: 'CAD' }]);
    expect(out.missing).toHaveLength(1);
  });

  it('flags a sale counted from both the register and the reader', () => {
    const out = checkMarketCards([pos('POS-1', 25)], DAY, [{ id: 'ch_1', amount: 25, currency: 'CAD', recorded: true }]);
    expect(out.doubled).toEqual([expect.objectContaining({ chargeId: 'ch_1' })]);
  });

  it('ignores cash, voided rows, reader-recorded rows, other days and refunded payments', () => {
    const rows = [
      pos('POS-1', 25, { notes: 'Cash' }),
      pos('POS-2', 25, { voided: true }),
      pos('POS-3', 25, { notes: 'Card reader' }),
      pos('POS-4', 25, { date: '2026-09-19' }),
    ];
    expect(checkMarketCards(rows, DAY, [])).toEqual({ missing: [], doubled: [] });
    expect(checkMarketCards([pos('POS-1', 25)], DAY, [{ id: 'ch_1', amount: 25, currency: 'CAD', refunded: true }]).missing).toHaveLength(1);
  });
});

describe('what the summary adds', () => {
  it('says nothing when they agree', () => {
    expect(describeMarketCards({ missing: [], doubled: [] })).toBe('');
  });

  it('explains both problems in plain words', () => {
    const text = describeMarketCards({ missing: [{ cents: 2500 }], doubled: [{ cents: 2500 }] });
    expect(text).toContain('One sale was rung up as card but no matching card payment arrived (25.00 in all)');
    expect(text).toContain('One card sale looks recorded twice');
  });
});
