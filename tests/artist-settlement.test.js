import { describe, it, expect } from 'vitest';
import { describeArtistSettlement, calcArtistEarnings } from '../src/lib/earnings.js';

describe('author payment after both balances are offset', () => {
  const screenshot = { heldByArtistGross: 574.68, heldByArtistShare: 74.71, owedToArtist: 267.76, owedByArtist: 0 };

  it('keeps the author cut once and offsets the remaining royalties', () => {
    expect(describeArtistSettlement(screenshot)).toEqual({
      heldGross: 574.68, heldShare: 74.71, publisherHeld: 499.97,
      otherDebt: 0, royaltiesOwed: 267.76, overpaid: 0,
      expensesOwed: 0, expenses: [], expensesLeftOut: 0,
      netToPublisher: 232.21, amount: 232.21, direction: 'to-publisher',
    });
  });

  // The owner's screenshot: they hold 638.49 and keep 83.01, so owe 555.48;
  // the publisher owes 312.55 in earnings and a 28.17 shipping receipt.
  it('takes unpaid expenses off the net, on the same side as earnings', () => {
    const owner = { heldByArtistGross: 638.49, heldByArtistShare: 83.01, owedToArtist: 312.55, owedByArtist: 0 };
    const expenses = [{ id: 7, amount: 28.17, desc: 'Shipping Cost (Paid EUR 17.85)', date: '2025-10-08' }];
    expect(describeArtistSettlement(owner, { expenses })).toMatchObject({
      publisherHeld: 555.48, royaltiesOwed: 312.55, expensesOwed: 28.17,
      netToPublisher: 214.76, amount: 214.76, direction: 'to-publisher',
    });
    // Earnings are untouched: expenses are paid back at cost, not as pay.
    expect(describeArtistSettlement(owner, { expenses }).royaltiesOwed).toBe(312.55);
  });

  it('flips to the publisher paying when expenses outweigh what the author owes', () => {
    const owner = { heldByArtistGross: 100, heldByArtistShare: 20, owedToArtist: 30, owedByArtist: 0 };
    expect(describeArtistSettlement(owner, { expenses: [{ id: 1, amount: 45.5 }, { id: 2, amount: 10.1 }] }))
      .toMatchObject({ expensesOwed: 55.6, netToPublisher: -5.6, amount: 5.6, direction: 'to-artist' });
    expect(describeArtistSettlement(owner, { expenses: [{ id: 1, amount: 50 }] }))
      .toMatchObject({ amount: 0, direction: 'settled' });
  });

  it('includes only remaining manual debts and royalties, after existing offsets', () => {
    const stats = calcArtistEarnings({ profitTiers: [{ artistPct: 25 }] }, {
      hist: [{ qty: 1, price: 400 }, { qty: 1, price: 100, artistPending: true }],
      artistReceivables: [{ id: 'd', amount: 80 }, { id: 'void', amount: 1000, voided: true }],
      artistPayouts: [{ amount: 20, offsets: [{ id: 'd', amount: 30 }] }],
    });
    const result = describeArtistSettlement(stats);
    expect(result.otherDebt).toBe(50);
    expect(result.royaltiesOwed).toBe(50);
    expect(result.netToPublisher).toBe(75);
  });

  it('reverses the payment when the publisher owes more than the author holds', () => {
    expect(describeArtistSettlement({ ...screenshot, owedToArtist: 600 }))
      .toMatchObject({ direction: 'to-artist', amount: 100.03, netToPublisher: -100.03 });
  });

  it('reports no payment for exact cancellation and empty balances', () => {
    expect(describeArtistSettlement({ ...screenshot, owedToArtist: 499.97 }))
      .toMatchObject({ direction: 'settled', amount: 0 });
    expect(describeArtistSettlement({})).toMatchObject({ direction: 'settled', amount: 0 });
  });

  it('shows an existing overpayment separately and includes it in the net balance', () => {
    expect(describeArtistSettlement({ ...screenshot, owedToArtist: -10 }))
      .toMatchObject({ royaltiesOwed: 0, overpaid: 10, amount: 509.97 });
  });

  it('rounds each balance to cents', () => {
    expect(describeArtistSettlement({ heldByArtistGross: 0.3, heldByArtistShare: 0.1, owedToArtist: 0.1 }))
      .toMatchObject({ amount: 0.1 });
  });
});
