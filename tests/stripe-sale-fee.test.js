import { describe, expect, it } from 'vitest';
import {
  backfillSaleFees, bookFeeTotals, feeFromBalanceTransaction, splitFee, withSaleFee,
} from '../src/lib/stripe-sale-fee.js';

describe('the Stripe fee kept on each card sale', () => {
  it('reads the fee and its currency from the balance transaction', () => {
    expect(feeFromBalanceTransaction({ fee: 94, currency: 'cad' })).toEqual({ fee: 0.94, feeCurrency: 'CAD' });
    expect(feeFromBalanceTransaction({ fee: 120, currency: 'jpy' })).toEqual({ fee: 120, feeCurrency: 'JPY' });
    expect(feeFromBalanceTransaction({ fee: 0, currency: 'eur' })).toEqual({ fee: 0, feeCurrency: 'EUR' });
  });

  it('gives nothing when the balance transaction was not expanded or is odd', () => {
    expect(feeFromBalanceTransaction('txn_123')).toBeNull();
    expect(feeFromBalanceTransaction(null)).toBeNull();
    expect(feeFromBalanceTransaction({ fee: -5, currency: 'cad' })).toBeNull();
    expect(feeFromBalanceTransaction({ fee: 50 })).toBeNull();
  });

  it('splits one fee across a split sale so the parts add back up', () => {
    const parts = splitFee(1.01, [22, 22, 22]);
    expect(parts).toEqual([0.34, 0.34, 0.33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(1.01, 10);
    expect(splitFee(0.9, [30, 15])).toEqual([0.6, 0.3]);
    expect(splitFee(0, [10, 10])).toEqual([0, 0]);
  });

  it('adds the fee to the payment record, and leaves it alone with no fee', () => {
    const pay = { currency: 'CAD', amount: 22, ref: 'ch_1' };
    expect(withSaleFee(pay, { fee: 0.94, feeCurrency: 'CAD' })).toEqual({ ...pay, fee: 0.94, feeCurrency: 'CAD' });
    expect(withSaleFee(pay, { fee: 0.94, feeCurrency: 'CAD' }, 0.31)).toEqual({ ...pay, fee: 0.31, feeCurrency: 'CAD' });
    expect(withSaleFee(pay, { id: 'ch_1' })).toBe(pay);
    expect(withSaleFee(pay, null)).toBe(pay);
  });

  it('fills in the fee on older Stripe sales, once', () => {
    const states = {
      meadow: { hist: [
        { sheetsId: 'stripe-ch_a', payment: { currency: 'CAD', amount: 22 } },
        { sheetsId: 'stripe-ch_b-r1', payment: { currency: 'CAD', amount: 30 } },
        { sheetsId: 'stripe-ch_c', voided: true, payment: { currency: 'CAD', amount: 22 } },
        { sheetsId: 'stripe-ch_d-2', payment: { currency: 'CAD', amount: 11 } },
        { sheetsId: 'manual-1', payment: { currency: 'CAD', amount: 22 } },
      ] },
      harbour: { hist: [{ sheetsId: 'stripe-ch_a', payment: { currency: 'CAD', amount: 22, fee: 0.5, feeCurrency: 'CAD' } }] },
    };
    const payments = ['ch_a', 'ch_b', 'ch_c', 'ch_d'].map(id => ({ id, fee: 0.94, feeCurrency: 'CAD' }));
    expect(backfillSaleFees(states, payments)).toEqual(['meadow']);
    const [a, b, c, d, manual] = states.meadow.hist;
    expect(a.payment.fee).toBe(0.94);
    expect(b.payment.fee).toBe(0.94);
    expect(c.payment.fee).toBeUndefined();
    expect(d.payment.fee).toBeUndefined();
    expect(manual.payment.fee).toBeUndefined();
    expect(states.harbour.hist[0].payment.fee).toBe(0.5);
    expect(backfillSaleFees(states, payments)).toEqual([]);
  });

  it('totals a book’s fees by currency, skipping voided sales', () => {
    expect(bookFeeTotals([
      { payment: { fee: 0.94, feeCurrency: 'CAD' } },
      { payment: { fee: 1.1, feeCurrency: 'CAD' } },
      { payment: { fee: 0.5, feeCurrency: 'EUR' } },
      { voided: true, payment: { fee: 9, feeCurrency: 'CAD' } },
      { payment: { currency: 'CAD' } },
    ])).toEqual({ CAD: 2.04, EUR: 0.5 });
  });
});
