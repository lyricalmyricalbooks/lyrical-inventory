// A card-reader tap that names its book, and a recorded card sale that was refunded.
import { describe, it, expect } from 'vitest';
import { bookNamedIn, describeRefunds, refundsToRaise } from '../src/lib/stripe-sale-autorecord.js';

const BOOKS = {
  altrove: { id: 'altrove', title: 'Altrove' },
  hound: { id: 'hound', title: 'The Hound of Heaven' },
  ok: { id: 'ok', title: 'Ok' },
};

describe('reading the book from a card-reader description', () => {
  it('finds one title, whatever the case and accents', () => {
    expect(bookNamedIn('2x ALTROVE – market', BOOKS)).toBe('altrove');
    expect(bookNamedIn('the hound of heaven', BOOKS)).toBe('hound');
  });

  it('reads nothing when two titles are named, or none', () => {
    expect(bookNamedIn('Altrove + The Hound of Heaven', BOOKS)).toBe('');
    expect(bookNamedIn('Tote bag', BOOKS)).toBe('');
    expect(bookNamedIn('', BOOKS)).toBe('');
  });

  it('ignores very short titles, and titles inside other words', () => {
    expect(bookNamedIn('ok thanks', BOOKS)).toBe('');
    expect(bookNamedIn('Altroverse poster', BOOKS)).toBe('');
  });
});

describe('refunds that reach a recorded sale', () => {
  const sale = (extra = {}) => ({ bookId: 'altrove', sheetsId: 'stripe-ch_1', chargeId: 'ch_1', qty: 2, bookTitle: 'Altrove', paidAmount: 50, ...extra });

  it('offers to reverse a full refund', () => {
    const [item] = refundsToRaise([{ id: 're_1', chargeId: 'ch_1', amount: 50 }], [sale()]);
    expect(item).toMatchObject({ full: true, refundId: 're_1', sheetsId: 'stripe-ch_1' });
  });

  it('treats a partial refund as partial', () => {
    expect(refundsToRaise([{ chargeId: 'ch_1', amount: 10 }], [sale()])[0].full).toBe(false);
  });

  it('trusts Stripe when it says the charge is fully refunded', () => {
    expect(refundsToRaise([{ chargeId: 'ch_1', amount: 10, fullyRefunded: true }], [sale()])[0].full).toBe(true);
  });

  it('ignores refunds of charges it never recorded, failed refunds, and ones already raised', () => {
    expect(refundsToRaise([{ chargeId: 'ch_9', amount: 50 }], [sale()])).toEqual([]);
    expect(refundsToRaise([{ chargeId: 'ch_1', amount: 50, status: 'failed' }], [sale()])).toEqual([]);
    expect(refundsToRaise([{ chargeId: 'ch_1', amount: 50 }], [sale({ refundNoted: 're_1' })])).toEqual([]);
    expect(refundsToRaise([{ chargeId: 'ch_1', amount: 50 }], [sale({ voided: true })])).toEqual([]);
  });

  it('raises a charge once even when both the payment and the refund list report it', () => {
    expect(refundsToRaise([
      { chargeId: 'ch_1', amount: 50, fullyRefunded: true },
      { id: 're_1', chargeId: 'ch_1', amount: 50 },
    ], [sale()])).toHaveLength(1);
  });
});

describe('what the refund alert says', () => {
  it('explains what reversing does, for one sale', () => {
    const said = describeRefunds([{ full: true, qty: 2, bookTitle: 'Altrove' }]);
    expect(said).toMatchObject({ title: 'A card sale was refunded', canReverse: true, reverseLabel: 'Reverse it' });
    expect(said.detail).toContain('puts the 2 copies back in stock');
  });

  it('only mentions a partial refund, and offers no reversal for it', () => {
    const said = describeRefunds([{ full: false, qty: 1, bookTitle: 'Altrove' }]);
    expect(said.canReverse).toBe(false);
    expect(said.detail).toContain('Part of the Altrove sale was refunded');
  });

  it('sums several', () => {
    expect(describeRefunds([{ full: true, qty: 1 }, { full: true, qty: 2 }]).reverseLabel).toBe('Reverse all 2');
  });
});
