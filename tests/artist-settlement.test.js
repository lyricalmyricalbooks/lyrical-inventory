import { describe, it, expect } from 'vitest';
import { describeArtistSettlement, calcArtistEarnings } from '../src/lib/earnings.js';

describe('author payment after both balances are offset', () => {
  const screenshot = { heldByArtistGross: 574.68, heldByArtistShare: 74.71, owedToArtist: 267.76, owedByArtist: 0 };

  it('keeps the author cut once and offsets the remaining royalties', () => {
    expect(describeArtistSettlement(screenshot)).toEqual({
      heldGross: 574.68, heldShare: 74.71, publisherHeld: 499.97,
      otherDebt: 0, royaltiesOwed: 267.76, overpaid: 0,
      netToPublisher: 232.21, amount: 232.21, direction: 'to-publisher',
    });
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
