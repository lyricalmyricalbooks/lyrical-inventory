// Pure cash-flow aggregation helpers for the Tax Center.
//
// Kept DOM- and Firestore-free so the headline metrics, period-over-period
// deltas and the monthly mini-chart can be unit-tested without a browser.
// The iteration logic here mirrors renderTaxCenter()'s ledger build exactly —
// same filters (voided / artistPending sales, recorded artist payouts, stored
// baseAmount preference) — so the numbers can never drift from the ledger.

import { getBookCurrencyCode, roundCents } from './money.js';
import { saleCadAmounts, datedCadRate } from './sale-fx.js';
import { payoutDebtCollected } from './earnings.js';

const yearOf = (d) => (d ? String(d).substring(0, 4) : '');
const monthOf = (d) => (d ? String(d).substring(0, 7) : '');

function inYear(date, yearFilter) {
  if (yearFilter === 'all' || !yearFilter) return true;
  return yearOf(date) === yearFilter;
}

// Aggregate the headline + secondary metrics for a single period.
//
//   sources = { books, states, taxCenter, fxRateCache }
//   yearFilter = 'all' | 'YYYY'
//
// Returns { grossSales, operatingExpenses, artistPayouts, txnCount, unitsSold }
// where grossSales/operatingExpenses exactly match renderTaxCenter()'s totals
// (operating expenses EXCLUDE artist payouts, which are surfaced separately).
export function computeCashFlowMetrics(sources, yearFilter) {
  const { books = {}, states = {}, taxCenter = {}, fxRateCache = {} } = sources || {};
  let grossSales = 0;
  let operatingExpenses = 0;
  let artistPayouts = 0;
  let artistDebtRecovered = 0;
  let artistSettlementCashAdjustment = 0;
  let txnCount = 0;
  let unitsSold = 0;

  Object.keys(books).forEach((bid) => {
    if (bid.toLowerCase().includes('test') || books[bid]?.title?.toLowerCase()?.includes('test')) return;
    const s = states[bid] || {};
    const b = books[bid] || {};
    const cur = getBookCurrencyCode(b);
    const settlements = new Map((s.artistPayouts || []).filter(p => p.settlement && !p.voided).map(p => [p.id, p]));

    // Sales — skip pending-to-artist rows (unless voided, which counts as 0) and gratuities.
    (s.hist || []).filter((h) => (!h.artistPending || h.voided) && !h.gratuity).forEach((h) => {
      if (!inYear(h.date, yearFilter)) return;
      const qty = h.qty || 1;
      // Merchandise at the sale's own date's rate; customer shipping is CAD
      // already (see lib/sale-fx.js). Matches the Tax Centre ledger line for line.
      const fx = saleCadAmounts(h, cur, fxRateCache);
      const saleCad = roundCents(fx.merchandiseCad + fx.shippingCad);
      grossSales = roundCents(grossSales + saleCad);
      // Sales stay on their sale date for revenue reporting. Their cash is
      // received through the combined payment on its own date instead.
      if (settlements.has(h.artistSettlementId)) {
        artistSettlementCashAdjustment = roundCents(artistSettlementCashAdjustment - saleCad);
      }
      txnCount += 1;
      if (!h.voided) unitsSold += qty;
    });

    // Book-specific expenses (operating).
    (s.expenses || []).forEach((e) => {
      if (!inYear(e.date, yearFilter)) return;
      let eBase;
      if (e.baseAmount != null) {
        eBase = e.baseAmount;
      } else {
        eBase = roundCents((e.amount || 0) * datedCadRate(e.currency || 'CAD', e.date, fxRateCache).rate);
      }
      operatingExpenses += eBase;
    });

    // Artist payouts — tracked separately (NOT operating expenses).
    //
    // Read from `artistPayouts`, the payments actually recorded against the
    // book. This used to read `artistTransfers` filtered on a `paid` flag that
    // nothing in the app ever writes — settlement deletes the transfer rather
    // than marking it — so the total was always zero and every real payout was
    // invisible to the Tax Centre and these KPIs.
    (s.artistPayouts || []).forEach((p) => {
      if (p.voided) return;
      if (!inYear(p.date, yearFilter)) return;
      // `amount` is denominated in the book's own currency (a payout made in
      // another currency stores the foreign cash under `payment`).
      const hRate = datedCadRate(cur, p.date, fxRateCache).rate;
      artistPayouts = roundCents(artistPayouts + (Number(p.amount) || 0) * hRate);
      artistDebtRecovered = roundCents(artistDebtRecovered + payoutDebtCollected(p) * hRate);
      if (p.settlement) {
        const receipt = p.settlement;
        const cashRate = fxRateCache[`${receipt.cur}_CAD`] || 1;
        const cash = receipt.balance.direction === 'to-publisher' ? receipt.balance.amount
          : receipt.balance.direction === 'to-artist' ? -receipt.balance.amount : 0;
        artistSettlementCashAdjustment = roundCents(artistSettlementCashAdjustment + cash * cashRate
          + ((Number(p.amount) || 0) - payoutDebtCollected(p)) * hRate);
      }
    });
  });

  // General business expenses (operating).
  (taxCenter.businessExpenses || []).forEach((e) => {
    if (!inYear(e.date, yearFilter)) return;
    if (e.affectsCashFlow === false) return;
    const eCur = e.currency || 'CAD';
    // Same rule as the Tax Centre ledger (see _tcBuildLedger).
    const eFx = datedCadRate(eCur, e.date, fxRateCache);
    const eBase = e.baseAmount != null
      ? e.baseAmount
      : (e.fxMissing && eFx.estimated) || eFx.missing
        ? 0
        : roundCents((e.amount || 0) * eFx.rate);
    operatingExpenses += eBase;
  });

  return { grossSales, operatingExpenses, artistPayouts, txnCount, unitsSold,
    ...(artistDebtRecovered ? { artistDebtRecovered } : {}),
    ...(artistSettlementCashAdjustment ? { artistSettlementCashAdjustment } : {}) };
}

// Period-over-period delta for one metric. Handles a zero prior period without
// producing NaN / Infinity:
//   • prior 0, current 0  → null (no change worth showing)
//   • prior 0, current >0 → { kind: 'new' }
//   • otherwise           → { kind: 'pct', pct, dir: 'up'|'down'|'flat' }
// `expenseSemantics: true` flips the good/bad direction (a rise in expenses is
// "bad" rather than "good"), letting the caller colour the chip correctly.
export function cashFlowDelta(current, prior) {
  const cur = Number(current) || 0;
  const prev = Number(prior) || 0;
  if (prev === 0) {
    if (cur === 0) return null;
    return { kind: 'new' };
  }
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  const dir = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
  return { kind: 'pct', pct, dir };
}

// Build month buckets (for a single year) or year buckets (for "all time")
// from a built ledger array of { date, baseAmount, isIncome, sourceType }.
// Returns ordered [{ key, label, income, expense }]. Artist payouts are EXCLUDED
// from the expense bars so the chart matches the headline operating figures.
export function buildCashFlowBuckets(ledger, yearFilter) {
  const map = new Map();
  const monthly = yearFilter !== 'all' && yearFilter;

  if (monthly) {
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let m = 0; m < 12; m++) {
      const key = `${yearFilter}-${String(m + 1).padStart(2, '0')}`;
      map.set(key, { key, label: MONTHS[m], income: 0, expense: 0 });
    }
  }

  (ledger || []).forEach((item) => {
    if (item.sourceType === 'artistPayout' || item.sourceType === 'artistDebtRecovery') return; // separate from operating sales/expenses
    if (item.affectsCashFlow === false) return; // non-cash tax/accounting adjustment
    // When charting a single year, ignore any stray out-of-year rows so the
    // axis stays the 12 seeded months (the production ledger is already
    // year-filtered, but keep the helper robust for direct callers/tests).
    if (monthly && yearOf(item.date) !== yearFilter) return;
    const key = monthly ? monthOf(item.date) : yearOf(item.date);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, { key, label: monthly ? key.slice(5) : key, income: 0, expense: 0 });
    }
    const bucket = map.get(key);
    if (item.isIncome) bucket.income += item.baseAmount || 0;
    else bucket.expense += item.baseAmount || 0;
  });

  const buckets = Array.from(map.values()).sort((a, b) => (a.key > b.key ? 1 : a.key < b.key ? -1 : 0));
  return buckets;
}
