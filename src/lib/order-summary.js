// Money totals for the rows currently on screen in Order History.
//
// Order History is a table of money with no total anywhere on it. The band at
// the top counts *copies* (printed / on hand / distributed) and — because it is
// hidden the moment a channel filter is applied — filtering to "Website orders"
// leaves the screen with no summary at all. So the one question the table is
// there to answer ("what did this actually bring in?") has always been a
// mental-arithmetic job over a paginated list.
//
// This is a pure reducer over the descriptors buildOrderTimeline() already
// returns — { type:'hist', h, i } / { type:'consign', e } — plus the
// { type:'pending', h } rows renderHist() prepends for unapproved artist
// submissions. It does not re-derive the timeline, re-sort it, or touch stock
// maths; it only adds up what it is handed.
//
// The honesty rules, which are the whole point:
//   • Voided orders never count. They are struck through in the table and they
//     are struck out of the total.
//   • Gifted copies (gratuities) move stock but earn nothing, so they count as
//     copies given, never as revenue.
//   • A row recorded in another currency is NOT summed into the book's
//     currency. €32 and CA$32 are the same digits and roughly a 50% error, and
//     the app already refuses to conflate them row by row — the total refuses
//     the same way, and says how many orders it stepped around.
//   • Artist submissions awaiting approval are money that has not been agreed
//     yet, so they are totalled separately rather than folded in.
//   • Consignment shipments and returns are stock movements, not sales. They
//     explain why the row count is larger than the order count.
//
// Every excluded row is reported back, so the caller can always account for the
// gap between "rows on screen" and "orders in the total" instead of leaving the
// owner to wonder whether something was quietly dropped.

import { roundCents } from './money.js';

/** Cents-based accumulator: money never rides on a running float. */
const cents = (qty, price) => Math.round((Number(qty) || 0) * (Number(price) || 0) * 100);

function isGratuity(h) {
  return Boolean(h.gratuity) || h.chan === 'Gratuity';
}

/**
 * Summarise a slice of the order timeline.
 *
 * @param {Array} rows      Timeline descriptors, already filtered to what is on screen.
 * @param {object} [opts]
 * @param {string} [opts.bookCode]  ISO code the book is priced in today (e.g. 'CAD').
 * @param {(cur: string, fallback: string) => string} [opts.normalize]
 *        Currency-code normaliser; defaults to a trim/upper-case pass so the
 *        module stays a leaf with no opinion about symbol tables.
 * @returns {{
 *   orders: number, copies: number, gross: number, counted: number, average: number|null,
 *   voided: number, gifted: number, giftedOrders: number, movements: number,
 *   pending: { orders: number, copies: number, gross: number },
 *   foreign: Array<{ code: string, orders: number, copies: number }>,
 *   foreignOrders: number, excluded: boolean
 * }}
 */
export function summariseOrderRows(rows, opts = {}) {
  const bookCode = String(opts.bookCode || '').trim().toUpperCase();
  const normalize = typeof opts.normalize === 'function'
    ? opts.normalize
    : (cur, fallback) => (String(cur || '').trim().toUpperCase() || fallback);

  let grossCents = 0;
  let pendingCents = 0;
  const foreign = new Map();
  const out = {
    orders: 0,
    copies: 0,
    gross: 0,
    counted: 0,
    average: null,
    voided: 0,
    gifted: 0,
    giftedOrders: 0,
    movements: 0,
    pending: { orders: 0, copies: 0, gross: 0 },
    foreign: [],
    foreignOrders: 0,
    excluded: false,
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;

    // Consignment shipment / return — stock moved, nothing was sold here.
    if (row.type === 'consign') {
      if (row.e && !row.e.voided) out.movements += 1;
      continue;
    }

    const h = row.h;
    if (!h) continue;

    if (h.voided) { out.voided += 1; continue; }

    const qty = Math.max(0, Number(h.qty) || 0);

    if (isGratuity(h)) {
      out.giftedOrders += 1;
      out.gifted += qty;
      continue;
    }

    if (row.type === 'pending' || h.pendingAuth) {
      out.pending.orders += 1;
      out.pending.copies += qty;
      pendingCents += cents(qty, h.price);
      continue;
    }

    // Copies sold are currency-independent, so a foreign-currency order still
    // counts as an order and as copies off the shelf — it just can't be added
    // to a total denominated in the book's currency.
    out.orders += 1;
    out.copies += qty;

    const code = normalize(h.cur, bookCode);
    if (bookCode && code && code !== bookCode) {
      const seen = foreign.get(code) || { code, orders: 0, copies: 0 };
      seen.orders += 1;
      seen.copies += qty;
      foreign.set(code, seen);
      out.foreignOrders += 1;
      continue;
    }

    out.counted += 1;
    grossCents += cents(qty, h.price);
  }

  out.gross = roundCents(grossCents / 100);
  out.pending.gross = roundCents(pendingCents / 100);
  out.average = out.counted > 0 ? roundCents(out.gross / out.counted) : null;
  out.foreign = [...foreign.values()].sort((a, b) => b.orders - a.orders || (a.code < b.code ? -1 : 1));
  out.excluded = Boolean(
    out.voided || out.giftedOrders || out.movements || out.pending.orders || out.foreignOrders,
  );

  return out;
}

/**
 * Plain-language phrases for everything the total deliberately left out, in the
 * order a person would want to hear them: money that is only provisional first,
 * then figures that were skipped, then rows that were never sales.
 *
 * @param {ReturnType<typeof summariseOrderRows>} sum
 * @param {(n: number) => string} money  Formatter for an amount in the book's currency.
 * @returns {string[]}
 */
export function summaryExclusionNotes(sum, money = (n) => String(n)) {
  if (!sum) return [];
  const notes = [];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  if (sum.pending.orders) {
    notes.push(`${plural(sum.pending.orders, 'order', 'orders')} awaiting your approval (${money(sum.pending.gross)})`);
  }
  for (const f of sum.foreign) {
    notes.push(`${plural(f.orders, 'order', 'orders')} recorded in ${f.code}`);
  }
  if (sum.voided) notes.push(`${plural(sum.voided, 'voided order', 'voided orders')}`);
  if (sum.giftedOrders) notes.push(`${plural(sum.gifted, 'gifted copy', 'gifted copies')}`);
  if (sum.movements) notes.push(`${plural(sum.movements, 'consignment movement', 'consignment movements')}`);

  return notes;
}
