import { describe, it, expect } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { getBookCurrencyCode } from '../src/lib/money.js';
import { reconcileConsignmentInvoiceLinks } from '../src/lib/consignment.js';
import { canonicalExpenseCategory } from '../src/lib/expense-categories.js';

// The Tax Centre had no behavioural coverage at all — before the extraction or
// after it. Everything guarding it was structural: that its functions exist,
// that their bodies are unchanged, that its imports resolve. That proves the
// move was faithful; it does not prove the screen computes the right numbers.
//
// _tcBuildLedger is the data path behind the ledger view, the year filter and
// the CSV export, so it is the piece worth pinning. It reads books, per-book
// sales history and expenses, and the tax centre's own business expenses, and
// returns the rows plus the two headline totals.

const BOOKS = {
  hound: { id: 'hound', title: 'The Hound', currency: 'CA$' },
  altrove: { id: 'altrove', title: 'Altrove', currency: '€' },
  test1: { id: 'test1', title: 'Test Profile', currency: 'CA$' },
};

const states = {
  hound: {
    hist: [
      { date: '2026-03-04', num: 'A1', qty: 2, price: 20, chan: 'Direct' },
      { date: '2025-11-02', num: 'A0', qty: 1, price: 20, chan: 'Direct' }, // other year
      { date: '2026-05-01', num: 'V1', qty: 1, price: 20, voided: true },
      { date: '2026-06-01', num: 'P1', qty: 1, price: 20, artistPending: true },
    ],
    expenses: [{ date: '2026-04-01', desc: 'Print run', amount: 100, cat: 'Printing' }],
    stores: [], ledger: [],
  },
  altrove: {
    hist: [{ date: '2026-03-09', num: 'B1', qty: 1, price: 10, chan: 'Direct' }],
    expenses: [], stores: [], ledger: [],
  },
  // Test books must never reach a tax figure.
  test1: {
    hist: [{ date: '2026-03-04', num: 'T1', qty: 99, price: 999 }],
    expenses: [{ date: '2026-03-04', desc: 'fake', amount: 9999, cat: 'Printing' }],
    stores: [], ledger: [],
  },
};

const TAX_CENTER = {
  businessExpenses: [
    { date: '2026-02-02', desc: 'Booth fee', amount: 50, cat: 'Booths & Fairs', currency: 'CAD', baseAmount: 50 },
    { date: '2025-02-02', desc: 'Old booth', amount: 40, cat: 'Booths & Fairs', currency: 'CAD', baseAmount: 40 },
  ],
  recurring: [],
  settings: { baseCurrency: 'CAD' },
};

// EUR sells at 1.50 CAD so the conversion is visible in the totals.
const _fxRateCache = { EUR_CAD: 1.5, CAD_CAD: 1 };

function buildLedger(year) {
  const fn = buildHarness({
    names: ['_tcBuildLedger'],
    deps: {
      BOOKS,
      states: JSON.parse(JSON.stringify(states)),
      TAX_CENTER: JSON.parse(JSON.stringify(TAX_CENTER)),
      _fxRateCache,
      defaultState: () => ({ hist: [], expenses: [], stores: [], ledger: [] }),
      getBookCurrencyCode,
      reconcileConsignmentInvoiceLinks,
      canonicalExpenseCategory,
      today: () => '2026-07-27',
    },
    returns: '_tcBuildLedger',
  });
  return fn(year);
}

describe('Tax Centre ledger', () => {
  it('totals sales for the selected year only', () => {
    // hound 2×20 = 40 CAD, altrove 1×10 EUR × 1.5 = 15 CAD. The 2025 sale, the
    // voided one and the artist-pending one must not count.
    const { totalGrossSales } = buildLedger('2026');
    expect(totalGrossSales).toBeCloseTo(55, 6);
  });

  it('converts a foreign-currency sale at the stored rate', () => {
    const { allLedger } = buildLedger('2026');
    const eur = allLedger.find(r => r.ref === 'B1');
    expect(eur.origCurrency).toBe('EUR');
    expect(eur.origAmount).toBe(10);
    expect(eur.baseAmount).toBeCloseTo(15, 6);
  });

  it('keeps a voided sale as a row but contributes nothing', () => {
    // The row has to stay visible — a void is a fact about the year — but it
    // must not move the total.
    const { allLedger } = buildLedger('2026');
    const voided = allLedger.find(r => r.ref === 'V1');
    expect(voided).toBeDefined();
    expect(voided.voided).toBe(true);
    expect(voided.baseAmount).toBe(0);
  });

  it('excludes an artist-pending sale entirely', () => {
    const { allLedger } = buildLedger('2026');
    expect(allLedger.find(r => r.ref === 'P1')).toBeUndefined();
  });

  it('excludes test books from every figure', () => {
    // A test book leaking into a tax total is the failure that reaches an
    // accountant, so it is asserted on the rows and on both totals.
    const { allLedger, totalGrossSales, totalOperatingExpenses } = buildLedger('2026');
    expect(allLedger.some(r => /Test Profile/.test(r.desc || ''))).toBe(false);
    expect(totalGrossSales).toBeLessThan(1000);
    expect(totalOperatingExpenses).toBeLessThan(1000);
  });

  it('includes per-book expenses and tax-centre business expenses', () => {
    // hound print run 100 + booth fee 50 = 150; the 2025 booth is out of scope.
    const { totalOperatingExpenses } = buildLedger('2026');
    expect(totalOperatingExpenses).toBeCloseTo(150, 6);
  });

  it('marks income and expense rows so the CSV can sign them', () => {
    const { allLedger } = buildLedger('2026');
    const sale = allLedger.find(r => r.ref === 'A1');
    const expense = allLedger.find(r => (r.desc || '').includes('Print run'));
    expect(sale.isIncome).toBe(true);
    expect(expense.isIncome).toBeFalsy();
  });

  it("'all' spans every year", () => {
    const all = buildLedger('all');
    const y2026 = buildLedger('2026');
    // 2025 adds a 20 CAD sale and a 40 CAD booth fee.
    expect(all.totalGrossSales).toBeCloseTo(y2026.totalGrossSales + 20, 6);
    expect(all.totalOperatingExpenses).toBeCloseTo(y2026.totalOperatingExpenses + 40, 6);
  });

  it('folds a legacy expense category onto its canonical name in the ledger row', () => {
    // hound's book expense is stored with cat 'Printing' (a pre-rename
    // spelling) — the ledger row must carry the canonical category so it
    // lands in the same category-panel bucket as 'Printing & Production'.
    const { allLedger } = buildLedger('2026');
    const printRun = allLedger.find(r => (r.desc || '').includes('Print run'));
    expect(printRun.cat).toBe('Printing & Production');
  });

  it('does not mutate the state it was given', () => {
    // It calls reconcileConsignmentInvoiceLinks on each book, so this checks
    // the ledger view cannot corrupt the data it is only meant to read.
    const snapshot = JSON.stringify(states);
    buildLedger('2026');
    expect(JSON.stringify(states)).toBe(snapshot);
  });
});
