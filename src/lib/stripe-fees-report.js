// The Stripe fees report, worked out: what Stripe took from the year's sales,
// month by month, how that compares with the year before, and whether the
// ledger already holds the same figure.
//
// Pure, so the arithmetic behind every number on the report can be tested
// without a network, a clock, the DOM or a Stripe key. The feature module
// (src/features/stripe-fees.js) fetches and paints; this decides what it says.
//
// Amounts stay in Stripe's minor units (cents) until the moment they are shown,
// exactly like the transactions they are summed from — converting per row and
// then summing is how a report drifts a cent away from Stripe's own.

import { isZeroDecimalCurrency } from './invoice-payments.js';

/** Transaction types that are a customer paying you — the "fees on sales" line. */
export const SALES_TYPES = new Set(['charge', 'payment']);

/** Bump when the saved report's shape changes, so an old copy is ignored, not misread. */
export const REPORT_VERSION = 1;

export function minorToMajor(amt, cur) {
  return isZeroDecimalCurrency(cur) ? amt : amt / 100;
}

function bucket() {
  return { gross: 0, fee: 0, net: 0, count: 0 };
}

function add(into, tx) {
  into.gross += tx.amount || 0;
  into.fee += tx.fee || 0;
  into.net += tx.net || 0;
  into.count += 1;
}

/**
 * Sum fetched balance transactions into the report.
 *
 * Takes the rows fetchStripeTransactions() returns ({ year, currency, type,
 * amount, fee, net, created }). The month is read locally, like the year it
 * sits in, so a payment late on the 31st of December lands in December of the
 * year the ledger files it under.
 */
export function buildStripeFeeReport(txns, { fetchedAt = Date.now() } = {}) {
  const byYear = {};
  for (const tx of txns || []) {
    const year = tx.year;
    const cur = tx.currency;
    const y = byYear[year] = byYear[year] || {};
    const c = y[cur] = y[cur] || {
      sales: bucket(),
      total: bucket(),
      types: {},
      months: Array.from({ length: 12 }, () => ({ fee: 0, gross: 0, count: 0 })),
      billing: 0,
    };
    const type = tx.type || 'unknown';
    add(c.types[type] = c.types[type] || bucket(), tx);
    add(c.total, tx);
    if (SALES_TYPES.has(type)) {
      add(c.sales, tx);
      const month = new Date((tx.created || 0) * 1000).getMonth();
      const m = c.months[month];
      m.fee += tx.fee || 0;
      m.gross += tx.amount || 0;
      m.count += 1;
    }
  }
  // Abs of the year's sum, not a sum of abs: the same figure the filing code
  // has always used for Stripe's own billing, so the two can never disagree.
  for (const y of Object.values(byYear)) {
    for (const c of Object.values(y)) c.billing = Math.abs(c.types.stripe_fee?.gross || 0);
  }
  return {
    version: REPORT_VERSION,
    fetchedAt,
    txnCount: (txns || []).length,
    years: Object.keys(byYear).map(Number).sort((a, b) => b - a),
    byYear,
  };
}

/** Stripe's cut of the year's sales, as a percentage of what customers paid. */
export function effectiveRate(sales) {
  return sales && sales.gross > 0 ? (sales.fee / sales.gross) * 100 : 0;
}

/**
 * How a year's fees and rate moved against the same currency the year before.
 *
 * Pass throughMonth (0–11) for a year still running: it compares January to
 * that month on both sides, because ten months of this year against twelve of
 * last always reads as a drop.
 *
 * Null when there is nothing to compare with — a first year, or a currency
 * that only started being used this year — so the report can say "first year"
 * rather than inventing a hundred-percent jump.
 */
export function compareWithPriorYear(report, year, cur, { throughMonth = 11 } = {}) {
  const now = report?.byYear?.[year]?.[cur];
  const before = report?.byYear?.[year - 1]?.[cur];
  if (!now || !before || !(before.sales.count > 0)) return null;
  const upTo = (entry) => {
    if (throughMonth >= 11) return entry.sales;
    return entry.months.slice(0, throughMonth + 1)
      .reduce((s, m) => ({ fee: s.fee + m.fee, gross: s.gross + m.gross, count: s.count + m.count }), { fee: 0, gross: 0, count: 0 });
  };
  const a = upTo(now), b = upTo(before);
  if (!(b.count > 0)) return null;
  const feeChange = a.fee - b.fee;
  return {
    priorYear: year - 1,
    partial: throughMonth < 11,
    throughMonth,
    feeChange,
    feeChangePct: b.fee ? (feeChange / b.fee) * 100 : null,
    rateChange: effectiveRate(a) - effectiveRate(b),
  };
}

/**
 * The biggest month for fees, for the chart's scale and its summary sentence.
 * Null when no month had a fee.
 */
export function busiestMonth(months) {
  let best = null;
  (months || []).forEach((m, i) => {
    if (m.fee > 0 && (!best || m.fee > best.fee)) best = { month: i, ...m };
  });
  return best;
}

/**
 * Whether the ledger already holds what Stripe says a year cost, per currency.
 *
 * Reads the same two rows the filing code writes (refs stripe-fees:<yr>:<cur>
 * and stripe-billing:<yr>:<cur>) and compares their original-currency amounts,
 * never the converted ones — the exchange rate moves daily, and a figure that
 * matches in USD is filed correctly whatever today's CAD equivalent is.
 *
 *   none    – Stripe charged nothing to file for this year and currency
 *   missing – at least one figure has never been filed
 *   stale   – filed, but Stripe's figure has changed since (a running year,
 *             a late refund, a year that closed after it was filed)
 *   filed   – the ledger matches Stripe to the cent
 */
export function ledgerFilingStatus(entry, year, cur, businessExpenses = []) {
  const code = String(cur || '').toUpperCase();
  const wants = [
    { ref: `stripe-fees:${year}:${code}`, amount: minorToMajor(entry?.sales?.fee || 0, code) },
    { ref: `stripe-billing:${year}:${code}`, amount: minorToMajor(entry?.billing || 0, code) },
  ].filter(w => w.amount > 0);
  if (!wants.length) return { state: 'none', stripeAmount: 0, ledgerAmount: 0, filedAt: null };

  const byRef = new Map();
  for (const e of businessExpenses || []) {
    if (e && typeof e.ref === 'string') byRef.set(e.ref, e);
  }
  let missing = false, stale = false, ledgerAmount = 0, filedAt = null;
  for (const w of wants) {
    const row = byRef.get(w.ref);
    if (!row) { missing = true; continue; }
    const filed = Number(row.origAmount ?? row.amount) || 0;
    ledgerAmount += filed;
    if (Math.abs(filed - w.amount) >= 0.005) stale = true;
    if (row.date && (!filedAt || row.date > filedAt)) filedAt = row.date;
  }
  const stripeAmount = wants.reduce((s, w) => s + w.amount, 0);
  const state = missing ? 'missing' : stale ? 'stale' : 'filed';
  return { state, stripeAmount, ledgerAmount, filedAt };
}

/**
 * Fold a partial fetch into a saved report.
 *
 * The background job only asks Stripe for the years it may rewrite. Those
 * years replace the saved copy's; every older year is kept as it was, so the
 * report a publisher opens is never shorter than the one they last fetched.
 */
export function mergeReportYears(saved, fresh, fromYear) {
  if (!saved || saved.version !== REPORT_VERSION) return null;
  const byYear = {};
  for (const y of saved.years) if (y < fromYear) byYear[y] = saved.byYear[y];
  for (const y of fresh.years) if (y >= fromYear) byYear[y] = fresh.byYear[y];
  const keptCount = Object.keys(byYear)
    .filter(y => Number(y) < fromYear)
    .reduce((n, y) => n + Object.values(byYear[y]).reduce((s, c) => s + c.total.count, 0), 0);
  return {
    version: REPORT_VERSION,
    fetchedAt: fresh.fetchedAt,
    txnCount: keptCount + fresh.years
      .filter(y => y >= fromYear)
      .reduce((n, y) => n + Object.values(fresh.byYear[y]).reduce((s, c) => s + c.total.count, 0), 0),
    years: Object.keys(byYear).map(Number).sort((a, b) => b - a),
    byYear,
  };
}

/** The shape the ledger filing code takes, derived from the report. */
export function ledgerRowsFromReport(report) {
  const rows = [];
  for (const year of report?.years || []) {
    for (const [cur, c] of Object.entries(report.byYear[year] || {})) {
      if (c.sales.fee > 0 || c.billing > 0 || c.sales.gross > 0) {
        rows.push({
          year, cur,
          salesFeeMinor: c.sales.fee,
          salesCount: c.sales.count,
          totalFeeMinor: c.total.fee,
          salesGrossMinor: c.sales.gross,
          stripeBillingMinor: c.billing,
        });
      }
    }
  }
  return rows;
}

/** "just now", "5 minutes ago", "yesterday", "12 days ago". */
export function describeAge(at, now = Date.now()) {
  const mins = Math.floor((now - at) / 60000);
  if (!(mins >= 1)) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
