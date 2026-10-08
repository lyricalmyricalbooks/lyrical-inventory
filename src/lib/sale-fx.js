/**
 * sale-fx.js — the exchange rate a past sale (or payout) is reported at.
 *
 * The Tax Centre and the cash-flow figures used to convert every sale of a
 * non-CAD book at whatever rate was cached today. Last year's euro sales moved
 * every time the euro did, and a filed year's totals never stood still. They
 * also converted customer shipping, which is always recorded in CAD (see
 * currency-migration.js), as if it were in the book's currency.
 *
 * A sale is now valued, in order of preference, at:
 *   1. a rate stamped on the row when it was recorded (`cadRate`),
 *   2. the CAD actually collected, when the customer paid in CAD,
 *   3. the published rate for the sale's date (fetched once per currency as a
 *      date range and kept on the device — those rates never change),
 *   4. today's rate, flagged `estimated`, until (3) has been fetched.
 *
 * Pure: no DOM, no network. main.js does the fetching and keeps the cache.
 */
import { roundCents } from './money.js';

/** localStorage key for the dated rates, which never change once published. */
export const FX_HISTORY_KEY = 'lm-fx-history';

/** Cache key for a dated rate; the same shape fetchHistoricalRate uses. */
export function datedRateKey(from, to, date) {
  return `${from}_${to}@${date}`;
}

const code = (c) => String(c || 'CAD').toUpperCase();
const dayOf = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : '');

/**
 * Rate from `cur` to CAD for something dated `date`.
 * @returns {{rate: number, estimated: boolean, missing: boolean}}
 */
export function datedCadRate(cur, date, cache = {}) {
  const c = code(cur);
  if (c === 'CAD') return { rate: 1, estimated: false, missing: false };
  const day = dayOf(date);
  const dated = day ? Number(cache[datedRateKey(c, 'CAD', day)]) : 0;
  if (dated > 0) return { rate: dated, estimated: false, missing: false };
  const now = Number(cache[`${c}_CAD`]);
  if (now > 0) return { rate: now, estimated: true, missing: false };
  // Nothing known at all: keep the old 1.0 fallback, but say so.
  return { rate: 1, estimated: true, missing: true };
}

/** Rate from the book's currency to CAD for one sale row. */
export function saleCadRate(row, cur, cache = {}) {
  const c = code(cur);
  if (c === 'CAD') return { rate: 1, estimated: false, missing: false };
  const stamped = Number(row && row.cadRate);
  if (stamped > 0) return { rate: stamped, estimated: false, missing: false };
  const pay = row && row.payment;
  const nativeTotal = (Number(row?.price ?? row?.unitPrice) || 0) * (Number(row?.qty) || 1);
  if (pay && code(pay.currency) === 'CAD' && Number(pay.amount) > 0 && nativeTotal > 0) {
    return { rate: Number(pay.amount) / nativeTotal, estimated: false, missing: false };
  }
  return datedCadRate(c, row && row.date, cache);
}

/**
 * One sale row in CAD. Merchandise is converted at the sale's rate; customer
 * shipping is already CAD and is never converted.
 */
export function saleCadAmounts(row, cur, cache = {}) {
  const qty = row.qty || 1;
  const unit = row.price ?? row.unitPrice ?? 0;
  const merchandise = row.voided ? 0 : unit * qty;
  const shipping = row.voided ? 0 : (Number(row.shippingPaid) || 0);
  const r = saleCadRate(row, cur, cache);
  return {
    merchandise,
    merchandiseCad: roundCents(merchandise * r.rate),
    shippingCad: roundCents(shipping),
    rate: r.rate,
    estimated: r.estimated,
    missing: r.missing,
  };
}

/**
 * The dates, per currency, that still need a published rate: sales (and
 * payouts) of non-CAD books whose value would otherwise fall back to today's.
 *
 * @param {object} books  BOOKS
 * @param {object} states per-book states
 * @param {object} cache  the rate cache
 * @param {{currencyOf: (book: object) => string, skip?: (bookId: string, book: object) => boolean}} opts
 * @returns {Map<string, string[]>} currency → sorted unique dates
 */
export function datesNeedingRates(books, states, cache, { currencyOf, skip = () => false }) {
  const out = new Map();
  for (const id of Object.keys(books || {})) {
    const book = books[id];
    if (!book || skip(id, book)) continue;
    const c = code(currencyOf(book));
    if (c === 'CAD') continue;
    const s = (states && states[id]) || {};
    const add = (date) => {
      const day = dayOf(date);
      if (!day || Number(cache[datedRateKey(c, 'CAD', day)]) > 0) return;
      if (!out.has(c)) out.set(c, new Set());
      out.get(c).add(day);
    };
    for (const h of s.hist || []) {
      if (h.voided) continue;
      const r = saleCadRate(h, c, cache);
      if (r.estimated) add(h.date);
    }
    for (const p of s.artistPayouts || []) if (!p.voided) add(p.date);
  }
  const sorted = new Map();
  for (const [c, set] of out) sorted.set(c, [...set].sort());
  return sorted;
}

/**
 * Put a fetched date-range series into the cache for the wanted dates. A date
 * with no published rate (weekend, holiday) takes the latest earlier one, the
 * same rule the single-date lookup follows.
 *
 * @param {Record<string, number>} series date → rate
 * @returns {number} how many wanted dates were filled
 */
export function fillDatedRates(cache, from, to, series, wanted) {
  const days = Object.keys(series || {}).filter(d => Number(series[d]) > 0).sort();
  if (!days.length) return 0;
  let filled = 0;
  let i = 0;
  for (const day of [...(wanted || [])].sort()) {
    while (i + 1 < days.length && days[i + 1] <= day) i++;
    if (days[i] > day) continue; // before the series starts
    cache[datedRateKey(from, to, day)] = Number(series[days[i]]);
    filled++;
  }
  return filled;
}

/** Read the stored dated rates. Never throws. */
export function loadFxHistory(storage) {
  try {
    const raw = storage && storage.getItem(FX_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) if (k.includes('@') && Number(v) > 0) out[k] = Number(v);
    return out;
  } catch (_) {
    return {};
  }
}

/** Store the dated rates from the cache (only those; live rates go stale). Never throws. */
export function saveFxHistory(storage, cache) {
  try {
    if (!storage) return false;
    const out = {};
    for (const [k, v] of Object.entries(cache || {})) if (k.includes('@') && Number(v) > 0) out[k] = v;
    storage.setItem(FX_HISTORY_KEY, JSON.stringify(out));
    return true;
  } catch (_) {
    return false;
  }
}
