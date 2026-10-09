import { describe, it, expect } from 'vitest';
import {
  consignmentSaleAmounts,
  expectedConsignmentPayment,
  consignmentPaymentRecord,
  consignmentFxSummary,
} from '../src/lib/consignment-fx.js';
import { planCurrencyChange, applyCurrencyChange } from '../src/lib/currency-migration.js';

describe('consignmentSaleAmounts', () => {
  it('keeps a same-currency sale exactly as before', () => {
    const a = consignmentSaleAmounts({ qty: 2, unitPrice: 25, commission: 40, saleCur: 'CAD', bookCur: 'CAD' });
    expect(a).toEqual({ gross: 50, due: 30, sale: null });
  });

  it('converts a sale in the shop\'s currency into the book\'s, keeping the foreign side', () => {
    const a = consignmentSaleAmounts({ qty: 3, unitPrice: 20, commission: 40, saleCur: 'EUR', bookCur: 'CAD', fxRate: 1.5 });
    expect(a.due).toBe(54);
    expect(a.gross).toBe(90);
    expect(a.sale).toEqual({ currency: 'EUR', unitPrice: 20, gross: 60, due: 36, rate: 1.5 });
  });

  it('refuses a foreign sale with no rate rather than guessing 1:1', () => {
    expect(consignmentSaleAmounts({ qty: 1, unitPrice: 20, commission: 40, saleCur: 'EUR', bookCur: 'CAD' })).toBeNull();
    expect(consignmentSaleAmounts({ qty: 1, unitPrice: 20, commission: 40, saleCur: 'EUR', bookCur: 'CAD', fxRate: 0 })).toBeNull();
  });

  it('rounds to cents', () => {
    const a = consignmentSaleAmounts({ qty: 1, unitPrice: 19.99, commission: 35, saleCur: 'USD', bookCur: 'CAD', fxRate: 1.3712 });
    expect(a.sale.due).toBe(12.99);
    expect(a.due).toBe(17.81);
  });
});

describe('expectedConsignmentPayment', () => {
  it('expects the shop\'s own currency when the sale was in one', () => {
    expect(expectedConsignmentPayment({ amountDue: 54, sale: { currency: 'EUR', due: 36 } }, 'CAD')).toEqual({ currency: 'EUR', amount: 36 });
  });
  it('falls back to the book currency for ordinary rows', () => {
    expect(expectedConsignmentPayment({ amountDue: 30 }, 'CAD')).toEqual({ currency: 'CAD', amount: 30 });
  });
});

describe('consignmentPaymentRecord', () => {
  it('records a payment in another currency and the exchange difference', () => {
    const r = consignmentPaymentRecord({ amountDue: 54, bookCur: 'CAD', payCur: 'EUR', payAmount: 36, fxRate: 1.45, date: '2026-10-01' });
    expect(r).toEqual({ currency: 'EUR', amount: 36, rate: 1.45, convertedTotal: 52.2, date: '2026-10-01', difference: -1.8 });
  });
  it('a sale in euros can be paid in the book\'s currency', () => {
    const r = consignmentPaymentRecord({ amountDue: 54, bookCur: 'CAD', payCur: 'CAD', payAmount: 54 });
    expect(r.rate).toBeNull();
    expect(r.difference).toBe(0);
  });
  it('a foreign payment without a rate is not recorded', () => {
    expect(consignmentPaymentRecord({ amountDue: 54, bookCur: 'CAD', payCur: 'USD', payAmount: 40 })).toBeNull();
  });
});

describe('consignmentFxSummary', () => {
  it('is empty for an ordinary row', () => {
    expect(consignmentFxSummary({ amountDue: 30 }, 'CAD')).toBe('');
  });
  it('describes the shop price and the payment', () => {
    const e = {
      amountDue: 54,
      sale: { currency: 'EUR', unitPrice: 20, gross: 60, due: 36, rate: 1.5 },
      payment: { currency: 'EUR', amount: 36, rate: 1.45, convertedTotal: 52.2, difference: -1.8 },
    };
    expect(consignmentFxSummary(e, 'CAD')).toBe('Sold at EUR 20.00 @ 1.5000 · Paid EUR 36.00 @ 1.4500 → CAD 52.20 · short CAD 1.80');
  });
});

describe('currency change restates a consignment payment', () => {
  it('moves the book-currency side and leaves the cash received alone', () => {
    const e = {
      type: 'Sale', storeName: 'Rhizome', date: '2026-10-01', amountDue: 54, cur: 'CAD',
      sale: { currency: 'EUR', unitPrice: 20, gross: 60, due: 36, rate: 1.5 },
      payment: { currency: 'EUR', amount: 36, rate: 1.45, convertedTotal: 52.2, difference: -1.8, date: '2026-10-01' },
    };
    const state = { hist: [], ledger: [e], stores: [] };
    const plan = planCurrencyChange({ state, book: { currency: 'CA$' }, from: 'CAD', to: 'USD', rateFor: () => 0.5 });
    applyCurrencyChange(plan);
    expect(e.amountDue).toBe(27);
    expect(e.payment.convertedTotal).toBe(26.1);
    expect(e.payment.difference).toBe(-0.9);
    expect(e.payment.amount).toBe(36);
    expect(e.sale.due).toBe(36);
    // Derived rates follow the restatement.
    expect(consignmentFxSummary(e, 'USD')).toBe('Sold at EUR 20.00 @ 0.7500 · Paid EUR 36.00 @ 0.7250 → USD 26.10 · short USD 0.90');
  });
});

import { splitConsignmentPayment, storeSaleCurrency } from '../src/lib/consignment-fx.js';

describe('splitConsignmentPayment', () => {
  it('shares an invoice payment across its sales and adds up exactly', () => {
    const pay = consignmentPaymentRecord({ amountDue: 100, bookCur: 'CAD', payCur: 'EUR', payAmount: 66.67, fxRate: 1.4777 });
    const rows = [{ amountDue: 33.33 }, { amountDue: 33.33 }, { amountDue: 33.34 }];
    const parts = splitConsignmentPayment(pay, rows);
    expect(parts).toHaveLength(3);
    expect(parts.reduce((a, p) => Math.round((a + p.amount) * 100) / 100, 0)).toBe(66.67);
    expect(parts.reduce((a, p) => Math.round((a + p.convertedTotal) * 100) / 100, 0)).toBe(pay.convertedTotal);
    parts.forEach((p, i) => {
      expect(p.currency).toBe('EUR');
      expect(p.difference).toBe(Math.round((p.convertedTotal - rows[i].amountDue) * 100) / 100);
    });
  });
  it('is empty with nothing to split', () => {
    expect(splitConsignmentPayment(null, [{ amountDue: 1 }])).toEqual([]);
    expect(splitConsignmentPayment({ amount: 1, convertedTotal: 1 }, [])).toEqual([]);
  });
});

describe('storeSaleCurrency', () => {
  it('uses the store\'s remembered currency', () => {
    expect(storeSaleCurrency({ currency: 'EUR' }, 'CAD', ['CAD', 'EUR'])).toBe('EUR');
  });
  it('falls back to the book currency', () => {
    expect(storeSaleCurrency({}, 'CAD')).toBe('CAD');
    expect(storeSaleCurrency(null, 'USD')).toBe('USD');
    expect(storeSaleCurrency({ currency: 'XYZ' }, 'CAD', ['CAD', 'EUR'])).toBe('CAD');
  });
});
