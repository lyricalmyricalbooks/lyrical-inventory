// The Stripe fees report's arithmetic: every number the redesigned report
// shows comes from these, so they're checked here without a network or a DOM.
import { describe, expect, it } from 'vitest';
import {
  buildStripeFeeReport, busiestMonth, compareWithPriorYear, describeAge, effectiveRate,
  ledgerFilingStatus, ledgerRowsFromReport, mergeReportYears,
} from '../src/lib/stripe-fees-report.js';

/** A balance transaction as fetchStripeTransactions() hands it over. */
function tx(year, month, type, amount, fee, currency = 'CAD') {
  const created = Math.floor(new Date(year, month, 15, 12).getTime() / 1000);
  return { id: `txn_${year}_${month}_${type}_${amount}`, created, year, currency, type, amount, fee, net: amount - fee };
}

const txns = [
  tx(2025, 2, 'charge', 10000, 320),
  tx(2025, 5, 'charge', 5000, 175),
  tx(2026, 0, 'charge', 20000, 610),
  tx(2026, 0, 'payment', 3000, 117),
  tx(2026, 3, 'charge', 4000, 146),
  tx(2026, 3, 'refund', -4000, 0),
  tx(2026, 4, 'stripe_fee', -1500, 0),
  tx(2026, 4, 'payout', -15000, 0),
  tx(2026, 6, 'charge', 50000, 1500, 'USD'),
];

describe('building the report', () => {
  const report = buildStripeFeeReport(txns, { fetchedAt: 1 });

  it('lists years newest first', () => {
    expect(report.years).toEqual([2026, 2025]);
    expect(report.txnCount).toBe(txns.length);
  });

  it('counts only customer payments as sales', () => {
    const cad = report.byYear[2026].CAD;
    expect(cad.sales).toEqual({ gross: 27000, fee: 873, net: 26127, count: 3 });
    expect(cad.total.count).toBe(6);
  });

  it('puts each payment in its month', () => {
    const m = report.byYear[2026].CAD.months;
    expect(m[0]).toEqual({ fee: 727, gross: 23000, count: 2 });
    expect(m[3]).toEqual({ fee: 146, gross: 4000, count: 1 });
    expect(m[4].count).toBe(0); // Stripe's own billing and a payout are not sales
  });

  it("keeps Stripe's own billing apart from fees on sales", () => {
    expect(report.byYear[2026].CAD.billing).toBe(1500);
  });

  it('keeps currencies apart', () => {
    expect(report.byYear[2026].USD.sales.fee).toBe(1500);
    expect(report.byYear[2026].CAD.sales.fee).toBe(873);
  });

  it('gives the filing code the same rows the old aggregation did', () => {
    const rows = ledgerRowsFromReport(report);
    expect(rows).toContainEqual({
      year: 2026, cur: 'CAD', salesFeeMinor: 873, salesCount: 3,
      totalFeeMinor: 873, salesGrossMinor: 27000, stripeBillingMinor: 1500,
    });
  });
});

describe('reading the report', () => {
  const report = buildStripeFeeReport(txns);

  it('works out the effective rate', () => {
    expect(effectiveRate({ gross: 10000, fee: 320 })).toBeCloseTo(3.2);
    expect(effectiveRate({ gross: 0, fee: 0 })).toBe(0);
  });

  it('compares with the year before in the same currency', () => {
    const cmp = compareWithPriorYear(report, 2026, 'CAD');
    expect(cmp.priorYear).toBe(2025);
    expect(cmp.feeChange).toBe(873 - 495);
    expect(cmp.feeChangePct).toBeCloseTo(((873 - 495) / 495) * 100);
  });

  it('compares a running year with the same months of the year before', () => {
    // Through April: 2026 has Jan + Apr (873), 2025 only March (320).
    const cmp = compareWithPriorYear(report, 2026, 'CAD', { throughMonth: 3 });
    expect(cmp).toMatchObject({ partial: true, throughMonth: 3, feeChange: 873 - 320 });
    // Through February, 2025 had no payments yet: nothing fair to compare.
    expect(compareWithPriorYear(report, 2026, 'CAD', { throughMonth: 1 })).toBeNull();
  });

  it('has nothing to compare for a first year or a new currency', () => {
    expect(compareWithPriorYear(report, 2025, 'CAD')).toBeNull();
    expect(compareWithPriorYear(report, 2026, 'USD')).toBeNull();
  });

  it('finds the busiest month, and none when nothing was charged', () => {
    expect(busiestMonth(report.byYear[2026].CAD.months).month).toBe(0);
    expect(busiestMonth(Array.from({ length: 12 }, () => ({ fee: 0, gross: 0, count: 0 })))).toBeNull();
  });
});

describe('is it in the ledger?', () => {
  const entry = buildStripeFeeReport(txns).byYear[2026].CAD;
  const fees = { ref: 'stripe-fees:2026:CAD', origAmount: 8.73, amount: 8.73, date: '2026-10-01' };
  const billing = { ref: 'stripe-billing:2026:CAD', origAmount: 15, amount: 15, date: '2026-10-01' };

  it('says filed when both rows match to the cent', () => {
    expect(ledgerFilingStatus(entry, 2026, 'CAD', [fees, billing])).toMatchObject({
      state: 'filed', stripeAmount: 23.73, filedAt: '2026-10-01',
    });
  });

  it('says out of date when Stripe has moved on since', () => {
    const old = { ...fees, origAmount: 5 };
    expect(ledgerFilingStatus(entry, 2026, 'CAD', [old, billing])).toMatchObject({ state: 'stale', ledgerAmount: 20 });
  });

  it('says not filed when a row is missing', () => {
    expect(ledgerFilingStatus(entry, 2026, 'CAD', [fees]).state).toBe('missing');
    expect(ledgerFilingStatus(entry, 2026, 'CAD', []).state).toBe('missing');
  });

  it("compares in the fee's own currency, never the converted one", () => {
    // A USD row converts to CAD at a rate that moves daily; the USD amount doesn't.
    const usd = buildStripeFeeReport(txns).byYear[2026].USD;
    const row = { ref: 'stripe-fees:2026:USD', origAmount: 15, amount: 15, baseAmount: 20.61 };
    expect(ledgerFilingStatus(usd, 2026, 'USD', [row]).state).toBe('filed');
  });

  it('has nothing to file for a year with no fees', () => {
    const quiet = buildStripeFeeReport([tx(2026, 1, 'payout', -100, 0)]).byYear[2026].CAD;
    expect(ledgerFilingStatus(quiet, 2026, 'CAD', []).state).toBe('none');
  });
});

describe('the background job folding into the saved report', () => {
  const saved = buildStripeFeeReport(txns, { fetchedAt: 1 });
  const fresh = buildStripeFeeReport([tx(2026, 8, 'charge', 1000, 59)], { fetchedAt: 2 });

  it('replaces the years it fetched and keeps the older ones', () => {
    const merged = mergeReportYears(saved, fresh, 2026);
    expect(merged.years).toEqual([2026, 2025]);
    expect(merged.byYear[2025]).toEqual(saved.byYear[2025]);
    expect(merged.byYear[2026].CAD.sales.fee).toBe(59);
    expect(merged.byYear[2026].USD).toBeUndefined();
    expect(merged.fetchedAt).toBe(2);
    expect(merged.txnCount).toBe(2 + 1);
  });

  it('starts nothing from a partial fetch when there was no saved report', () => {
    expect(mergeReportYears(null, fresh, 2026)).toBeNull();
    expect(mergeReportYears({ version: 0, years: [] }, fresh, 2026)).toBeNull();
  });
});

describe('saying how old the report is', () => {
  const now = Date.UTC(2026, 9, 22, 12);
  it.each([
    [now - 10 * 1000, 'just now'],
    [now - 5 * 60000, '5 minutes ago'],
    [now - 60 * 60000, '1 hour ago'],
    [now - 26 * 3600000, 'yesterday'],
    [now - 12 * 86400000, '12 days ago'],
  ])('%#', (at, said) => {
    expect(describeAge(at, now)).toBe(said);
  });
});
