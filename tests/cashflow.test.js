import { describe, it, expect } from 'vitest';
import {
  computeCashFlowMetrics,
  cashFlowDelta,
  buildCashFlowBuckets,
} from '../src/lib/cashflow.js';

// Two books: one CAD, one USD (with a cached FX rate).
const books = {
  b1: { id: 'b1', currency: 'CA$' }, // -> CAD
  b2: { id: 'b2', currency: 'US$' }, // -> USD
};
const fxRateCache = { CAD_CAD: 1, USD_CAD: 1.3 };

const states = {
  b1: {
    hist: [
      { id: 's1', date: '2025-03-01', price: 20, qty: 2 },          // 40 CAD
      { id: 's2', date: '2024-11-01', price: 10, qty: 1 },          // 10 CAD (prior year)
      { id: 's3', date: '2025-06-01', price: 15, qty: 1, voided: true }, // voided -> 0
      { id: 's4', date: '2025-07-01', price: 5, qty: 1, artistPending: true }, // skipped
      { id: 's6', date: '2025-08-01', price: 0, qty: 1, gratuity: true }, // gratuity -> skipped
    ],
    expenses: [
      { id: 'e1', date: '2025-02-01', amount: 8, currency: 'CAD', baseAmount: 8 },
      { id: 'e2', date: '2024-02-01', amount: 4, currency: 'CAD', baseAmount: 4 },
    ],
    artistTransfers: [
      { id: 't1', paid: true, paidDate: '2025-05-01', total: 12 }, // 12 CAD payout
      { id: 't2', paid: false, paidDate: '2025-05-01', total: 99 }, // unpaid -> skipped
    ],
  },
  b2: {
    hist: [
      { id: 's5', date: '2025-04-01', price: 100, qty: 1 }, // 100 USD * 1.3 = 130 CAD
    ],
    expenses: [
      // Legacy entry without baseAmount -> convert via fxRateCache
      { id: 'e3', date: '2025-08-01', amount: 10, currency: 'USD' }, // 10 * 1.3 = 13 CAD
    ],
    artistTransfers: [],
  },
};

const taxCenter = {
  businessExpenses: [
    { id: 'be1', date: '2025-09-01', amount: 50, currency: 'CAD', baseAmount: 50 },
    { id: 'be2', date: '2023-09-01', amount: 5, currency: 'CAD', baseAmount: 5 },
  ],
};

const sources = { books, states, taxCenter, fxRateCache };

describe('computeCashFlowMetrics', () => {
  it('aggregates 2025 metrics with FX conversion, excluding payouts from opex', () => {
    const m = computeCashFlowMetrics(sources, '2025');
    // Gross: 40 (s1) + 0 (s3 voided) + 130 (s5) = 170
    expect(m.grossSales).toBeCloseTo(170, 5);
    // Operating expenses: 8 (e1) + 13 (e3) + 50 (be1) = 71  (NO payouts)
    expect(m.operatingExpenses).toBeCloseTo(71, 5);
    // Artist payouts tracked separately: 12 (t1 only, t2 unpaid)
    expect(m.artistPayouts).toBeCloseTo(12, 5);
    // Sale rows counted: s1, s3(voided still a row), s5 = 3 (s4 artistPending skipped)
    expect(m.txnCount).toBe(3);
    // Units: s1(2) + s5(1) = 3 (voided s3 contributes 0 units)
    expect(m.unitsSold).toBe(3);
  });

  it('filters by prior year correctly', () => {
    const m = computeCashFlowMetrics(sources, '2024');
    expect(m.grossSales).toBeCloseTo(10, 5);
    expect(m.operatingExpenses).toBeCloseTo(4, 5);
    expect(m.artistPayouts).toBe(0);
    expect(m.txnCount).toBe(1);
  });

  it('sums everything for "all"', () => {
    const m = computeCashFlowMetrics(sources, 'all');
    // 40 + 10 + 0 + 130 = 180
    expect(m.grossSales).toBeCloseTo(180, 5);
    // 8 + 4 + 13 + 50 + 5 = 80
    expect(m.operatingExpenses).toBeCloseTo(80, 5);
    expect(m.artistPayouts).toBeCloseTo(12, 5);
  });

  it('tolerates missing state / empty sources', () => {
    expect(computeCashFlowMetrics(null, 'all')).toEqual({
      grossSales: 0, operatingExpenses: 0, artistPayouts: 0, txnCount: 0, unitsSold: 0,
    });
    expect(computeCashFlowMetrics({ books: { x: {} }, states: {}, taxCenter: {}, fxRateCache: {} }, 'all').grossSales).toBe(0);
  });

  it('excludes the test1 profile book from metrics', () => {
    const customBooks = {
      ...books,
      test1: { id: 'test1', title: 'test1', currency: 'CA$' },
      otherTest: { id: 't_other', title: '  test1  ', currency: 'CA$' }
    };
    const customStates = {
      ...states,
      test1: {
        hist: [{ id: 's_test', date: '2025-03-01', price: 20, qty: 2 }],
        expenses: [{ id: 'e_test', date: '2025-02-01', amount: 8, currency: 'CAD', baseAmount: 8 }]
      },
      otherTest: {
        hist: [{ id: 's_test2', date: '2025-03-01', price: 10, qty: 1 }]
      }
    };
    const customSources = { books: customBooks, states: customStates, taxCenter, fxRateCache };
    const m = computeCashFlowMetrics(customSources, '2025');
    // It should be exactly the same as without test1 and otherTest (grossSales = 170, operatingExpenses = 71)
    expect(m.grossSales).toBeCloseTo(170, 5);
    expect(m.operatingExpenses).toBeCloseTo(71, 5);
  });
});

describe('cashFlowDelta', () => {
  it('returns null when both periods are zero', () => {
    expect(cashFlowDelta(0, 0)).toBeNull();
  });
  it('flags a new period when prior was zero', () => {
    expect(cashFlowDelta(100, 0)).toEqual({ kind: 'new' });
  });
  it('computes a percentage rise', () => {
    const d = cashFlowDelta(112, 100);
    expect(d.kind).toBe('pct');
    expect(d.dir).toBe('up');
    expect(d.pct).toBeCloseTo(12, 5);
  });
  it('computes a percentage drop', () => {
    const d = cashFlowDelta(92, 100);
    expect(d.dir).toBe('down');
    expect(d.pct).toBeCloseTo(-8, 5);
  });
  it('reports flat for negligible change', () => {
    expect(cashFlowDelta(100, 100).dir).toBe('flat');
  });
  it('never produces NaN / Infinity', () => {
    const d = cashFlowDelta(50, 0);
    expect(Number.isNaN(d.pct)).toBe(false);
  });
});

describe('buildCashFlowBuckets', () => {
  const ledger = [
    { date: '2025-03-10', baseAmount: 40, isIncome: true, sourceType: 'sale' },
    { date: '2025-03-20', baseAmount: 8, isIncome: false, sourceType: 'bookExpense' },
    { date: '2025-05-01', baseAmount: 12, isIncome: false, sourceType: 'artistPayout' }, // excluded
    { date: '2024-11-01', baseAmount: 10, isIncome: true, sourceType: 'sale' },
  ];

  it('produces 12 month buckets for a single year and excludes artist payouts', () => {
    const buckets = buildCashFlowBuckets(ledger, '2025');
    expect(buckets).toHaveLength(12);
    const mar = buckets.find(b => b.key === '2025-03');
    expect(mar.income).toBe(40);
    expect(mar.expense).toBe(8);
    const may = buckets.find(b => b.key === '2025-05');
    expect(may.expense).toBe(0); // artist payout excluded
    expect(buckets[0].label).toBe('Jan');
  });

  it('buckets by year for "all"', () => {
    const buckets = buildCashFlowBuckets(ledger, 'all');
    const keys = buckets.map(b => b.key);
    expect(keys).toEqual(['2024', '2025']);
    expect(buckets.find(b => b.key === '2025').income).toBe(40);
  });

  it('returns 12 empty month buckets for a year with no data', () => {
    const buckets = buildCashFlowBuckets([], '2025');
    expect(buckets).toHaveLength(12);
    expect(buckets.every(b => b.income === 0 && b.expense === 0)).toBe(true);
  });
});
