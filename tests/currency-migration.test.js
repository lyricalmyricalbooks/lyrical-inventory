import { describe, it, expect } from 'vitest';
import {
  bookCurrencyCode,
  codeToBookSymbol,
  entryCurrencyCode,
  collectNativeAmounts,
  stampNativeCurrency,
  isFullyStamped,
  planCurrencyChange,
  applyCurrencyChange,
  appendCurrencyLog,
  detectCurrencyMismatch,
  inferRecordedCurrency,
  describePlan,
} from '../src/lib/currency-migration.js';

const book = (over = {}) => ({
  id: 'b', title: 'Book', currency: '€', listPrice: 40, productionCost: 1000,
  maxPrint: 100, profitTiers: [], ...over,
});

// A sale recorded natively (paid in the book's own currency): buildPaymentMeta
// writes amount === convertedTotal with no rate.
const nativeSale = (over = {}) => ({
  num: 'MAN-1', qty: 1, price: 32, date: '2026-05-23', chan: 'Fair',
  payment: { currency: 'EUR', amount: 32, rate: null, convertedTotal: 32 },
  ...over,
});

const state = (over = {}) => ({
  stock: 90, sold: 0, revenue: 0, chStats: {}, hist: [], stores: [], ledger: [],
  artistTransfers: [], artistPayouts: [], expenses: [], invoices: [], ...over,
});

describe('bookCurrencyCode / codeToBookSymbol', () => {
  it('normalizes the stored symbol into an ISO code', () => {
    expect(bookCurrencyCode({ currency: '€' })).toBe('EUR');
    expect(bookCurrencyCode({ currency: 'CA$' })).toBe('CAD');
    expect(bookCurrencyCode({ currency: 'USD' })).toBe('USD');
  });
  it('round-trips a code back to the symbol the book stores', () => {
    expect(codeToBookSymbol('EUR')).toBe('€');
    expect(codeToBookSymbol('CAD')).toBe('CA$');
  });
  it('falls back to EUR for an unusable value', () => {
    expect(bookCurrencyCode({})).toBe('EUR');
    expect(bookCurrencyCode(null)).toBe('EUR');
  });
});

describe('entryCurrencyCode', () => {
  it('prefers the entry stamp over the book currency', () => {
    expect(entryCurrencyCode({ cur: 'EUR' }, book({ currency: 'CA$' }))).toBe('EUR');
  });
  it('falls back to the book currency for unstamped legacy rows', () => {
    expect(entryCurrencyCode({}, book({ currency: 'CA$' }))).toBe('CAD');
  });
});

describe('collectNativeAmounts', () => {
  it('reaches every scope that holds a native-denominated amount', () => {
    const s = state({
      hist: [nativeSale()],
      ledger: [{ id: 1, type: 'Sale', storeName: 'Casa', date: '2026-08-03', qty: 1, amountDue: 25 }],
      stores: [{ id: 1, name: 'Casa', amountOwed: 25 }],
      artistPayouts: [{ id: 1, date: '2026-04-01', amount: 100 }],
      artistTransfers: [{ id: 1, num: 'T-1', price: 10, total: 20, date: '2026-04-02' }],
      revenue: 500,
      chStats: { Fair: { txns: 1, units: 1, revenue: 500 } },
    });
    const scopes = new Set(collectNativeAmounts(s, book()).map(f => f.scope));
    expect(scopes).toEqual(new Set(['book', 'hist', 'ledger', 'store', 'payout', 'transfer', 'totals']));
  });

  it('includes a payment convertedTotal but never the foreign amount paid', () => {
    const s = state({
      hist: [nativeSale({ payment: { currency: 'USD', amount: 36, rate: 1.41, convertedTotal: 50.78 } })],
    });
    const fields = collectNativeAmounts(s, book());
    expect(fields.some(f => f.label.includes('converted total'))).toBe(true);
    // The USD cash the customer handed over is historical fact, not a native amount.
    expect(fields.every(f => f.get() !== 36)).toBe(true);
  });

  it('never touches customer-paid shipping — that is natively CAD', () => {
    const s = state({ hist: [nativeSale({ shippingPaid: 18.5 })] });
    expect(collectNativeAmounts(s, book()).every(f => f.get() !== 18.5)).toBe(true);
  });

  it('skips zero and non-finite amounts', () => {
    const s = state({
      ledger: [{ id: 1, type: 'Shipment', storeName: 'Casa', date: '2026-01-01', qty: 5, amountDue: 0 }],
    });
    expect(collectNativeAmounts(s, book({ productionCost: 0 })).every(f => f.get() !== 0)).toBe(true);
  });

  it('picks up profit tier caps', () => {
    const b = book({ profitTiers: [{ label: 'Break-even', revenueUpTo: 1000, artistPct: 0 }] });
    const labels = collectNativeAmounts(state(), b).map(f => f.label);
    expect(labels).toContain('Profit tier 1 cap');
  });
});

describe('stampNativeCurrency / isFullyStamped', () => {
  it('marks every record without moving a number', () => {
    const s = state({ hist: [nativeSale()], revenue: 32 });
    const b = book();
    expect(isFullyStamped(s, b)).toBe(false);
    stampNativeCurrency(s, b, 'EUR');
    expect(isFullyStamped(s, b)).toBe(true);
    expect(s.hist[0].price).toBe(32);
    expect(s.hist[0].cur).toBe('EUR');
    expect(s.revenue).toBe(32);
  });
});

describe('planCurrencyChange', () => {
  it('multiplies each amount by the rate for its own date', () => {
    const s = state({ hist: [nativeSale({ date: '2026-05-23' }), nativeSale({ num: 'MAN-2', price: 40, date: '2026-01-10' })] });
    const rates = { '2026-05-23': 1.5, '2026-01-10': 1.4 };
    const plan = planCurrencyChange({
      state: s, book: book(), from: 'EUR', to: 'CAD',
      rateFor: (d) => rates[d] || 1.45,
    });
    const byLabel = Object.fromEntries(plan.changes.map(c => [`${c.field.label}@${c.field.date}`, c.after]));
    expect(byLabel['Sale MAN-1 unit price@2026-05-23']).toBe(48);
    expect(byLabel['Sale MAN-2 unit price@2026-01-10']).toBe(56);
  });

  it('accepts a flat numeric rate', () => {
    const s = state({ hist: [nativeSale()] });
    const plan = planCurrencyChange({ state: s, book: book(), from: 'EUR', to: 'CAD', rateFor: 2 });
    expect(plan.changes.every(c => c.rate === 2)).toBe(true);
  });

  it('rounds to whole cents', () => {
    const s = state({ hist: [nativeSale({ price: 33.33 })] });
    const plan = planCurrencyChange({ state: s, book: book(), from: 'EUR', to: 'CAD', rateFor: 1.4104 });
    const priceChange = plan.changes.find(c => c.field.label.includes('unit price'));
    expect(priceChange.after).toBe(47.01);
  });

  it('counts amounts it has no rate for instead of silently zeroing them', () => {
    const s = state({ hist: [nativeSale()] });
    const plan = planCurrencyChange({ state: s, book: book(), from: 'EUR', to: 'CAD', rateFor: 0 });
    expect(plan.changes).toHaveLength(0);
    expect(plan.missingRate).toBeGreaterThan(0);
  });

  it('honours the skip predicate for hand-edited book fields', () => {
    const plan = planCurrencyChange({
      state: state(), book: book(), from: 'EUR', to: 'CAD', rateFor: 1.5,
      skip: (f) => f.scope === 'book' && f.label === 'List price',
    });
    expect(plan.changes.some(c => c.field.label === 'List price')).toBe(false);
    expect(plan.changes.some(c => c.field.label === 'Production cost')).toBe(true);
  });

  it('reports before/after totals for the dialog headline', () => {
    const s = state({
      hist: [nativeSale({ price: 10, payment: { currency: 'EUR', amount: 10, rate: null, convertedTotal: 10 } })],
    });
    const plan = planCurrencyChange({ state: s, book: book({ listPrice: 0, productionCost: 0 }), from: 'EUR', to: 'CAD', rateFor: 2 });
    expect(plan.totalBefore).toBe(20);   // unit price 10 + converted total 10
    expect(plan.totalAfter).toBe(40);
  });
});

describe('applyCurrencyChange', () => {
  it('restates the numbers and stamps the records with an audit trail', () => {
    const s = state({ hist: [nativeSale()], revenue: 32 });
    const b = book();
    const plan = planCurrencyChange({ state: s, book: b, from: 'EUR', to: 'CAD', rateFor: 1.5 });
    applyCurrencyChange(plan, { at: '2026-08-04T00:00:00.000Z' });

    expect(s.hist[0].price).toBe(48);
    expect(s.hist[0].payment.convertedTotal).toBe(48);
    expect(s.hist[0].cur).toBe('CAD');
    expect(s.hist[0]._fx).toEqual({ from: 'EUR', to: 'CAD', rate: 1.5, at: '2026-08-04T00:00:00.000Z' });
    expect(s.revenue).toBe(48);
    expect(b.listPrice).toBe(60);
  });

  it('leaves the foreign cash actually paid untouched', () => {
    const s = state({ hist: [nativeSale({ payment: { currency: 'USD', amount: 36, rate: 1.41, convertedTotal: 50.78 } })] });
    const plan = planCurrencyChange({ state: s, book: book(), from: 'EUR', to: 'CAD', rateFor: 1.5 });
    applyCurrencyChange(plan);
    expect(s.hist[0].payment.amount).toBe(36);
    expect(s.hist[0].payment.currency).toBe('USD');
    expect(s.hist[0].payment.rate).toBe(1.41);
    expect(s.hist[0].payment.convertedTotal).toBe(76.17);
  });

  it('never double-converts when re-run — the whole point of the stamp', () => {
    const s = state({ hist: [nativeSale()], revenue: 32 });
    const b = book();
    applyCurrencyChange(planCurrencyChange({ state: s, book: b, from: 'EUR', to: 'CAD', rateFor: 1.5 }));
    const afterFirst = s.hist[0].price;

    const second = planCurrencyChange({ state: s, book: b, from: 'EUR', to: 'CAD', rateFor: 1.5 });
    expect(second.changes).toHaveLength(0);
    applyCurrencyChange(second);
    expect(s.hist[0].price).toBe(afterFirst);
  });

  it('stamps records that were already in the target currency', () => {
    const s = state({ hist: [nativeSale({ cur: 'CAD' })] });
    const plan = planCurrencyChange({ state: s, book: book(), from: 'EUR', to: 'CAD', rateFor: 1.5 });
    expect(plan.skipped.length).toBeGreaterThan(0);
    applyCurrencyChange(plan);
    expect(s.hist[0].price).toBe(32);
    expect(s.hist[0].cur).toBe('CAD');
  });

  it('converts a partially-migrated book without touching the done half', () => {
    const s = state({
      hist: [nativeSale({ num: 'DONE', price: 48, cur: 'CAD' }), nativeSale({ num: 'TODO', price: 32 })],
    });
    const plan = planCurrencyChange({ state: s, book: book({ listPrice: 0, productionCost: 0 }), from: 'EUR', to: 'CAD', rateFor: 1.5 });
    applyCurrencyChange(plan);
    expect(s.hist.find(h => h.num === 'DONE').price).toBe(48);
    expect(s.hist.find(h => h.num === 'TODO').price).toBe(48);
  });
});

describe('inferRecordedCurrency', () => {
  it('reads the native currency off a same-currency payment', () => {
    expect(inferRecordedCurrency(nativeSale())).toBe('EUR');
  });
  it('trusts an explicit stamp first', () => {
    expect(inferRecordedCurrency(nativeSale({ cur: 'CAD' }))).toBe('CAD');
  });
  it('refuses to guess from a converted foreign payment', () => {
    expect(inferRecordedCurrency(nativeSale({
      payment: { currency: 'USD', amount: 36, rate: 1.41, convertedTotal: 50.78 },
    }))).toBeNull();
    // No rate recorded, but the amounts disagree — still not evidence.
    expect(inferRecordedCurrency(nativeSale({
      payment: { currency: 'CAD', amount: 64.09, rate: null, convertedTotal: 40 },
    }))).toBeNull();
  });
  it('returns null when there is nothing to go on', () => {
    expect(inferRecordedCurrency({ price: 10 })).toBeNull();
    expect(inferRecordedCurrency(null)).toBeNull();
  });
});

describe('detectCurrencyMismatch', () => {
  it('finds nothing on a consistent book', () => {
    const s = state({ hist: [nativeSale({ cur: 'EUR' })] });
    expect(detectCurrencyMismatch(s, book()).mismatched).toBe(0);
  });

  it('flags stamped records left behind by a currency change', () => {
    const s = state({ hist: [nativeSale({ cur: 'EUR' })] });
    const res = detectCurrencyMismatch(s, book({ currency: 'CA$' }));
    expect(res).toMatchObject({ code: 'EUR', source: 'stamp' });
    expect(res.mismatched).toBeGreaterThan(0);
  });

  // The state this app is actually in for a book switched before stamping
  // existed: no `cur` anywhere, but the payment metadata still remembers.
  it('infers the stranded currency from legacy payment metadata', () => {
    const s = state({ hist: [nativeSale(), nativeSale({ num: 'MAN-2' })] });
    expect(detectCurrencyMismatch(s, book({ currency: 'CA$' })))
      .toEqual({ mismatched: 2, code: 'EUR', source: 'payment' });
  });

  it('ignores voided rows when inferring', () => {
    const s = state({ hist: [nativeSale({ voided: true })] });
    expect(detectCurrencyMismatch(s, book({ currency: 'CA$' })).mismatched).toBe(0);
  });
});

describe('appendCurrencyLog', () => {
  it('records the move and caps the log so a document cannot grow forever', () => {
    const b = book();
    for (let i = 0; i < 25; i++) appendCurrencyLog(b, { from: 'EUR', to: 'CAD', mode: 'convert', records: i });
    expect(b.currencyLog).toHaveLength(20);
    expect(b.currencyLog.at(-1)).toMatchObject({ from: 'EUR', to: 'CAD', mode: 'convert', records: 24 });
    expect(b.currencyLog.at(-1).at).toBeTruthy();
  });
});

describe('describePlan', () => {
  it('says plainly when there is nothing to do', () => {
    const plan = planCurrencyChange({ state: state(), book: book({ listPrice: 0, productionCost: 0 }), from: 'EUR', to: 'CAD', rateFor: 1.5 });
    expect(describePlan(plan)).toContain('Nothing to convert');
  });
  it('summarises the work', () => {
    const s = state({ hist: [nativeSale()] });
    const plan = planCurrencyChange({ state: s, book: book(), from: 'EUR', to: 'CAD', rateFor: 1.5 });
    expect(describePlan(plan)).toContain('restated from EUR to CAD');
  });
});

// End-to-end shape of the reported bug: a €-priced book with EUR history gets
// switched to CA$. Before the fix every figure kept its number and gained a CA$
// symbol; after restatement the figures are real Canadian dollars.
describe('the reported bug, end to end', () => {
  it('restates a book switched from EUR to CAD', () => {
    const b = book({ currency: '€', listPrice: 40, productionCost: 0 });
    const s = state({
      hist: [
        nativeSale({ num: 'MAN-1779554190229', price: 32, date: '2026-05-23' }),
        nativeSale({ num: 'MAN-1777685511060', qty: 2, price: 76.92, date: '2026-05-02',
          payment: { currency: 'EUR', amount: 153.84, rate: null, convertedTotal: 153.84 } }),
      ],
      revenue: 185.84,
    });

    // 1. The app can tell, unaided, that this book's history is stranded in EUR.
    b.currency = 'CA$';
    const detected = detectCurrencyMismatch(s, b);
    expect(detected).toMatchObject({ code: 'EUR', source: 'payment' });

    // 2. Restating at 1.5 turns €32 into real CA$48 rather than a relabelled 32.
    const plan = planCurrencyChange({ state: s, book: b, from: 'EUR', to: 'CAD', rateFor: 1.5 });
    applyCurrencyChange(plan);

    expect(s.hist[0].price).toBe(48);
    expect(s.hist[0].payment.convertedTotal).toBe(48);
    expect(s.hist[1].price).toBe(115.38);
    expect(s.revenue).toBe(278.76);
    expect(b.listPrice).toBe(60);

    // 3. And the book now reads as internally consistent.
    expect(detectCurrencyMismatch(s, b).mismatched).toBe(0);
    expect(isFullyStamped(s, b)).toBe(true);
  });
});
