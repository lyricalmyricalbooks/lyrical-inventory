import { describe, it, expect } from 'vitest';
import {
  datedRateKey, datedCadRate, saleCadRate, saleCadAmounts, datesNeedingRates, fillDatedRates,
  loadFxHistory, saveFxHistory, FX_HISTORY_KEY,
} from '../src/lib/sale-fx.js';
import { computeCashFlowMetrics } from '../src/lib/cashflow.js';

const memoryStorage = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};

describe('saleCadRate — what a past sale is worth in CAD', () => {
  const cache = { EUR_CAD: 1.5, [datedRateKey('EUR', 'CAD', '2025-03-03')]: 1.42 };

  it('is 1 for a CAD book', () => {
    expect(saleCadRate({ date: '2025-03-03' }, 'CAD', cache)).toMatchObject({ rate: 1, estimated: false });
  });

  it('prefers a rate stamped on the sale', () => {
    expect(saleCadRate({ date: '2025-03-03', cadRate: 1.3 }, 'EUR', cache).rate).toBe(1.3);
  });

  it('uses the CAD actually collected when the customer paid in CAD', () => {
    const row = { date: '2025-03-03', qty: 2, price: 10, payment: { currency: 'CAD', amount: 29 } };
    expect(saleCadRate(row, 'EUR', cache).rate).toBeCloseTo(1.45, 10);
  });

  it('uses the published rate for the sale\'s date', () => {
    expect(saleCadRate({ date: '2025-03-03' }, 'EUR', cache)).toMatchObject({ rate: 1.42, estimated: false });
  });

  it('falls back to today\'s rate, flagged as an estimate', () => {
    expect(saleCadRate({ date: '2024-01-01' }, 'EUR', cache)).toMatchObject({ rate: 1.5, estimated: true, missing: false });
  });

  it('says when no rate is known at all', () => {
    expect(datedCadRate('MXN', '2024-01-01', {})).toMatchObject({ rate: 1, missing: true });
  });
});

describe('saleCadAmounts', () => {
  it('converts merchandise but never customer shipping, which is CAD already', () => {
    const r = saleCadAmounts({ date: '2025-03-03', qty: 1, price: 30, shippingPaid: 10 }, 'EUR', { [datedRateKey('EUR', 'CAD', '2025-03-03')]: 1.5 });
    expect(r.merchandiseCad).toBe(45);
    expect(r.shippingCad).toBe(10);
  });

  it('counts nothing for a voided sale', () => {
    const r = saleCadAmounts({ qty: 1, price: 30, shippingPaid: 10, voided: true }, 'CAD', {});
    expect(r.merchandiseCad + r.shippingCad).toBe(0);
  });
});

describe('cash-flow gross sales', () => {
  it('matches the worked example: €30 sale + CA$10 shipping at 1.50 is CA$55, not CA$60', () => {
    const books = { b: { id: 'b', title: 'Altrove', currency: '€' } };
    const states = { b: { hist: [{ date: '2025-03-03', qty: 1, price: 30, shippingPaid: 10 }] } };
    const { grossSales } = computeCashFlowMetrics({ books, states, taxCenter: {}, fxRateCache: { EUR_CAD: 1.5 } }, 'all');
    expect(grossSales).toBe(55);
  });

  it('stops moving with today\'s rate once the sale\'s date rate is known', () => {
    const books = { b: { id: 'b', title: 'Altrove', currency: '€' } };
    const states = { b: { hist: [{ date: '2025-03-03', qty: 1, price: 100 }] } };
    const dated = { [datedRateKey('EUR', 'CAD', '2025-03-03')]: 1.4 };
    const a = computeCashFlowMetrics({ books, states, taxCenter: {}, fxRateCache: { ...dated, EUR_CAD: 1.5 } }, 'all');
    const b = computeCashFlowMetrics({ books, states, taxCenter: {}, fxRateCache: { ...dated, EUR_CAD: 1.6 } }, 'all');
    expect(a.grossSales).toBe(140);
    expect(b.grossSales).toBe(140);
  });
});

describe('datesNeedingRates', () => {
  const books = {
    eur: { id: 'eur', currency: '€' },
    cad: { id: 'cad', currency: 'CA$' },
    test: { id: 'test', currency: '€' },
  };
  const states = {
    eur: {
      hist: [
        { date: '2025-03-03', qty: 1, price: 10 },
        { date: '2025-03-03', qty: 1, price: 10 },
        { date: '2025-04-01', qty: 1, price: 10, voided: true },
        { date: '2025-05-01', qty: 1, price: 10, payment: { currency: 'CAD', amount: 14 } },
      ],
      artistPayouts: [{ date: '2025-06-30', amount: 5 }],
    },
    cad: { hist: [{ date: '2025-03-03', qty: 1, price: 10 }] },
    test: { hist: [{ date: '2025-01-01', qty: 1, price: 10 }] },
  };
  const currencyOf = b => ({ '€': 'EUR', 'CA$': 'CAD' }[b.currency]);

  it('lists each foreign date once, skipping CAD books, voids, CAD-paid sales and skipped books', () => {
    const out = datesNeedingRates(books, states, {}, { currencyOf, skip: id => id === 'test' });
    expect([...out.keys()]).toEqual(['EUR']);
    expect(out.get('EUR')).toEqual(['2025-03-03', '2025-06-30']);
  });

  it('leaves out dates already known', () => {
    const cache = { [datedRateKey('EUR', 'CAD', '2025-03-03')]: 1.4, [datedRateKey('EUR', 'CAD', '2025-06-30')]: 1.5 };
    expect(datesNeedingRates(books, states, cache, { currencyOf, skip: id => id === 'test' }).size).toBe(0);
  });
});

describe('fillDatedRates', () => {
  it('fills a weekend from the Friday before, and skips dates before the series', () => {
    const cache = {};
    const n = fillDatedRates(cache, 'EUR', 'CAD', { '2025-03-07': 1.41, '2025-03-10': 1.43 }, ['2025-03-01', '2025-03-08', '2025-03-10']);
    expect(n).toBe(2);
    expect(cache[datedRateKey('EUR', 'CAD', '2025-03-08')]).toBe(1.41);
    expect(cache[datedRateKey('EUR', 'CAD', '2025-03-10')]).toBe(1.43);
    expect(cache[datedRateKey('EUR', 'CAD', '2025-03-01')]).toBeUndefined();
  });
});

describe('stored dated rates', () => {
  it('keeps only dated rates, which never change, and reads them back', () => {
    const storage = memoryStorage();
    saveFxHistory(storage, { EUR_CAD: 1.5, [datedRateKey('EUR', 'CAD', '2025-03-03')]: 1.42 });
    expect(JSON.parse(storage.getItem(FX_HISTORY_KEY))).toEqual({ 'EUR_CAD@2025-03-03': 1.42 });
    expect(loadFxHistory(storage)).toEqual({ 'EUR_CAD@2025-03-03': 1.42 });
  });

  it('reads nothing from a damaged value instead of throwing', () => {
    expect(loadFxHistory(memoryStorage({ [FX_HISTORY_KEY]: '{oops' }))).toEqual({});
    expect(loadFxHistory(null)).toEqual({});
  });
});
