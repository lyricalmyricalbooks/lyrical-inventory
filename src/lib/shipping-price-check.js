// Is shipping paying for itself — per label, and per destination?
//
// Two checks, both pure so they can be tested without a ledger:
//
// 1. Per label. The moment a label is chosen or bought for an order, compare
//    its price with what the customer paid for shipping on that order. Saying
//    so on the day is the only time it can still change anything: a cheaper
//    service can still be picked, and a website rate that is too low can be
//    fixed before the next order goes out at the same loss.
//
// 2. Per destination. Once enough orders to one region have real postage
//    against them, compare what customers have typically been charged with
//    what postage has typically cost, and suggest a website price for the
//    first book and for each extra book — the two numbers a shop's shipping
//    settings actually ask for.
//
// All amounts are in one currency (the callers only pass Canadian-dollar
// orders), and all rounding is to the cent.

const LOSS_MARGIN = 0.5; // under 50 cents is noise, not a pricing problem

function cents(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function money(n) {
  return `$${cents(Math.abs(n)).toFixed(2)}`;
}

// ─── 1. One label against one order ────────────────────────────────────────

/**
 * How one postage price compares with what the customer paid for shipping.
 * `paid` of zero or less means the order has no shipping figure to compare
 * with (a pickup, a free-shipping promotion, an order typed in by hand), so
 * nothing is said about it.
 */
export function rateAgainstPaid(price, paid) {
  const p = Number(price);
  const c = Number(paid);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= 0) return null;
  const gap = cents(p - c);
  const losing = gap > LOSS_MARGIN;
  return {
    gap,
    losing,
    text: losing
      ? `${money(gap)} more than the customer paid`
      : 'Covered by what the customer paid',
  };
}

/** The line above a list of rates: what the customer paid, and how many options cost more. */
export function describeRatesAgainstPaid(prices = [], paid) {
  const c = Number(paid);
  if (!Number.isFinite(c) || c <= 0) return '';
  const list = (Array.isArray(prices) ? prices : []).map(Number).filter(Number.isFinite);
  if (!list.length) return '';
  const over = list.filter(p => p - c > LOSS_MARGIN).length;
  const head = `The customer paid ${money(c)} for shipping on this order.`;
  if (!over) return `${head} Every option here is covered.`;
  if (over === list.length) return `${head} Every option here costs more than that — your website’s shipping price for this destination may be too low.`;
  return `${head} ${over} of these ${list.length} options cost more than that; the ones marked in green don’t.`;
}

// ─── 2. Orders whose postage came in over what the customer paid ──────────

/**
 * Recent orders that lost money on postage and haven't been mentioned yet.
 * `orders` are `{ num, date, paid, postage }`. `seen` of null means this
 * device has never checked: nothing is announced, so turning this on never
 * produces a burst of old news, and every current loser is remembered.
 */
export function newPostageLosses(orders = [], seen = null, { today = '', withinDays = 21 } = {}) {
  const cutoff = today ? Date.parse(`${today}T12:00:00`) - withinDays * 86400000 : -Infinity;
  const losing = (Array.isArray(orders) ? orders : []).filter(o => {
    if (!o || !o.num) return false;
    const when = Date.parse(`${String(o.date || '').slice(0, 10)}T12:00:00`);
    if (Number.isFinite(cutoff) && (!Number.isFinite(when) || when < cutoff)) return false;
    const verdict = rateAgainstPaid(o.postage, o.paid);
    return !!verdict && verdict.losing;
  }).map(o => ({ ...o, gap: cents(Number(o.postage) - Number(o.paid)) }));
  const ids = losing.map(o => String(o.num));
  if (!Array.isArray(seen)) return { fresh: [], remember: ids };
  const known = new Set(seen.map(String));
  // Remembered ids are kept even after they age out of the window, capped, so
  // an order is never announced twice however the window moves.
  const remember = [...new Set([...seen.map(String), ...ids])].slice(-500);
  return { fresh: losing.filter(o => !known.has(String(o.num))), remember };
}

/** An order number as the customer saw it: no leading '#', one is added when shown. */
const orderLabel = (num) => String(num || '').replace(/^#+/, '');

export function describePostageLosses(fresh = []) {
  const list = Array.isArray(fresh) ? fresh : [];
  if (!list.length) return { count: 0, title: '', detail: '' };
  if (list.length === 1) {
    const o = list[0];
    return {
      count: 1,
      title: `Order #${orderLabel(o.num)} cost ${money(o.gap)} more to post than the customer paid`,
      detail: `The label was ${money(o.postage)}; the customer paid ${money(o.paid)} for shipping${o.destination ? ` to ${o.destination}` : ''}. If this keeps happening for the same place, your website’s shipping price there is too low.`,
    };
  }
  const total = list.reduce((sum, o) => sum + o.gap, 0);
  const nums = list.slice(0, 4).map(o => `#${orderLabel(o.num)}`).join(', ');
  const more = list.length > 4 ? ` and ${list.length - 4} more` : '';
  return {
    count: list.length,
    title: `${list.length} recent orders cost more to post than customers paid`,
    detail: `${nums}${more} — ${money(total)} short in all. The Shipping page suggests website prices that would cover it.`,
  };
}

// ─── 3. Suggested website prices, per destination ─────────────────────────

export const REGION_NAMES = {
  ON: 'Ontario',
  CA: 'the rest of Canada',
  US: 'the United States',
  intl: 'other countries',
};

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * For each destination with enough history: what customers have typically
 * paid for a one-book parcel, what postage for one has typically cost, and
 * a suggested price for the first book and each extra book.
 *
 * `orders` are `{ date, region, qty, paid, postage }`, one per order (not per
 * book row), with both money figures known. The suggested first-book price
 * covers three parcels in four (the 75th percentile), rounded up to the
 * dollar, so an occasional heavy parcel doesn't set the price for everyone
 * and most don't lose money.
 */
export function shippingPriceCheck(orders = [], { today = '', months = 6, minOrders = 5, pct = 75 } = {}) {
  const cutoff = today ? Date.parse(`${today}T12:00:00`) - months * 30.5 * 86400000 : -Infinity;
  const byRegion = new Map();
  (Array.isArray(orders) ? orders : []).forEach(o => {
    if (!o || !REGION_NAMES[o.region]) return;
    const paid = Number(o.paid);
    const postage = Number(o.postage);
    if (!(paid > 0) || !(postage > 0)) return;
    const when = Date.parse(`${String(o.date || '').slice(0, 10)}T12:00:00`);
    if (Number.isFinite(cutoff) && (!Number.isFinite(when) || when < cutoff)) return;
    const list = byRegion.get(o.region) || [];
    list.push({ qty: Math.max(1, Math.round(Number(o.qty) || 1)), paid, postage });
    byRegion.set(o.region, list);
  });

  const results = [];
  byRegion.forEach((list, region) => {
    const singles = list.filter(o => o.qty === 1);
    if (singles.length < minOrders) return;
    const typicalPaid = cents(median(singles.map(o => o.paid)));
    const typicalPostage = cents(percentile(singles.map(o => o.postage), pct));
    const suggestFirst = Math.ceil(typicalPostage);
    const multi = list.filter(o => o.qty > 1);
    const singleMedian = median(singles.map(o => o.postage));
    const extras = multi.map(o => (o.postage - singleMedian) / (o.qty - 1)).filter(n => Number.isFinite(n));
    const suggestExtra = extras.length >= 2 ? Math.max(1, Math.ceil(median(extras))) : null;
    const shortBy = cents(typicalPostage - typicalPaid);
    results.push({
      region,
      name: REGION_NAMES[region],
      orders: list.length,
      singles: singles.length,
      typicalPaid,
      typicalPostage,
      suggestFirst,
      suggestExtra,
      shortBy,
      undercharging: shortBy > 1,
    });
  });
  const order = Object.keys(REGION_NAMES);
  return results.sort((a, b) => order.indexOf(a.region) - order.indexOf(b.region));
}

/** The notification. Says nothing when every destination is covered. */
export function describeShippingPriceCheck(results = []) {
  const short = (Array.isArray(results) ? results : []).filter(r => r.undercharging)
    .sort((a, b) => b.shortBy - a.shortBy);
  if (!short.length) return { count: 0, title: '', detail: '' };
  const lines = short.slice(0, 3).map(r => {
    const extra = r.suggestExtra != null ? ` and $${r.suggestExtra} for each extra book` : '';
    return `${r.name[0].toUpperCase()}${r.name.slice(1)}: customers have been paying about ${money(r.typicalPaid)} but postage has been about ${money(r.typicalPostage)} — charge $${r.suggestFirst} for the first book${extra}.`;
  });
  return {
    count: short.length,
    title: short.length === 1
      ? `Your website shipping price for ${short[0].name} is too low`
      : `Your website shipping prices are too low for ${short.length} destinations`,
    detail: `${lines.join(' ')} Based on ${short.reduce((n, r) => n + r.singles, 0)} one-book orders from the last six months.`,
  };
}
