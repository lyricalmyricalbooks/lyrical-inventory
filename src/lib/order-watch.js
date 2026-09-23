// Noticing a sale on your own, and saying so.
//
// The storefront check already ran once at boot, silently, to put a number on
// a tab badge. Two things were missing from that. It ran once — a PWA left open
// all day never looked again, so an order placed at 11am was invisible until
// the app was reloaded — and it never said anything, so even when it did find
// something the only evidence was a small number on a tab the publisher had no
// reason to be looking at.
//
// This module is the decision half of fixing both: when another check is worth
// making, which of the orders that came back are genuinely new, and what to say
// about them. Pure — no DOM, no timers, no network — so the two rules that
// actually matter can be tested directly:
//
//   1. The first run must never announce the backlog. A publisher who installs
//      this on a store with sixty historical orders should be told about the
//      sixty-first, not woken up by all sixty. `seedSeenOrders` exists for
//      exactly that moment and is the reason `newOrdersSince` takes a seeded
//      flag rather than inferring "new" from an empty list.
//   2. An order is announced once. Re-announcing on every poll would train the
//      publisher to dismiss the thing without reading it, which is worse than
//      not having it.

import { bigCartelOrderNumber, bigCartelOrderDate } from './bigcartel-ledger-gap.js';
import { normalizeShippingOrderNumber } from './shipping-reconciliation.js';
import { dueForCheck } from './watch-schedule.js';

/** How many order numbers to remember. Comfortably more than any store's recent history. */
const SEEN_LIMIT = 400;

const clean = (value) => String(value ?? '').trim();

function normalizeStatus(order) {
  return clean(order?.attributes?.status).toLowerCase();
}

/**
 * A sale the storefront itself says did not happen is not news. Refunded is
 * deliberately absent: a refund is a real sale that was later reversed, and it
 * still needs recording and still needs the publisher to know.
 */
export function isAnnounceableOrder(order) {
  const status = normalizeStatus(order);
  return status !== 'cancelled' && status !== 'canceled'
    && status !== 'voided' && status !== 'abandoned';
}

/** The customer's name as the storefront gives it, in any of its shapes. */
export function orderCustomerName(order = {}) {
  const attr = order.attributes || order || {};
  const direct = attr.customer_name || attr.buyer_name || attr.shipping_name
    || attr.billing_name || attr.name;
  if (clean(direct)) return clean(direct);
  const first = attr.buyer_first_name || attr.customer_first_name || attr.first_name || '';
  const last = attr.buyer_last_name || attr.customer_last_name || attr.last_name || '';
  const full = `${clean(first)} ${clean(last)}`.trim();
  if (full) return full;
  return clean(attr.buyer_email || attr.customer_email || attr.email) || 'a customer';
}

/**
 * The orders in this batch that have never been announced.
 *
 * `seeded` is the whole safety of this function. False means the app has never
 * looked at this store before, so nothing here is news — it is history the
 * publisher already lived through — and the answer is always none.
 */
export function newOrdersSince(bcOrders = [], seenNums = [], { seeded = true } = {}) {
  if (!seeded) return [];
  const seen = new Set();
  (Array.isArray(seenNums) ? seenNums : []).forEach(value => {
    const normalized = normalizeShippingOrderNumber(value);
    if (normalized) seen.add(normalized);
  });

  const fresh = [];
  (Array.isArray(bcOrders) ? bcOrders : []).forEach(order => {
    if (!order || !isAnnounceableOrder(order)) return;
    const num = bigCartelOrderNumber(order);
    // No resolvable number means nothing can be remembered about it, so
    // announcing it would repeat on every single poll forever.
    if (!num || seen.has(num)) return;
    seen.add(num);
    fresh.push({
      num,
      orderId: String(order.id ?? ''),
      date: bigCartelOrderDate(order),
      customer: orderCustomerName(order),
      total: Number.parseFloat(order.attributes?.total) || 0,
    });
  });
  return fresh;
}

/** Every order number in this batch, for the first-run seed. */
export function seedSeenOrders(bcOrders = []) {
  const nums = [];
  (Array.isArray(bcOrders) ? bcOrders : []).forEach(order => {
    const num = bigCartelOrderNumber(order || {});
    if (num && !nums.includes(num)) nums.push(num);
  });
  return nums.slice(-SEEN_LIMIT);
}

/**
 * Fold announced numbers into the remembered list, newest last and capped.
 *
 * Capped rather than unbounded because this lives in browser storage, which is
 * a fixed budget shared with the offline queue — an ever-growing list of order
 * numbers is the sort of thing that quietly costs a publisher their queued
 * sales at a market three years from now.
 */
export function mergeSeenOrders(seenNums = [], announcedNums = []) {
  const merged = [];
  const push = (value) => {
    const num = normalizeShippingOrderNumber(value);
    if (num && !merged.includes(num)) merged.push(num);
  };
  (Array.isArray(seenNums) ? seenNums : []).forEach(push);
  (Array.isArray(announcedNums) ? announcedNums : []).forEach(push);
  return merged.slice(-SEEN_LIMIT);
}

/**
 * Whether to go and ask the storefront again.
 *
 * The gates themselves now live in lib/watch-schedule.js, shared with every
 * other check that runs without being asked. They were written out here first
 * and then copied verbatim into the Shippo watch; a third copy was about to be
 * written for the postage sweep, which is the point at which two identical
 * copies stops being a coincidence.
 *
 * The name stays because it reads correctly at its call site and because the
 * storefront watch is what it belongs to — this is one implementation with two
 * honest names, not two implementations.
 */
export const dueForRefresh = dueForCheck;

/**
 * What the notification says. Written for the publisher: who bought, and what
 * to do about it — never a count on its own, because "1 new order" tells you
 * nothing you could act on without opening something first.
 */
export function describeNewOrders(entries = []) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!list.length) return { title: '', detail: '', count: 0 };
  if (list.length === 1) {
    const [order] = list;
    return {
      count: 1,
      title: 'New order',
      detail: `${order.customer} just ordered — ${order.num}.`,
    };
  }
  const names = list.slice(0, 2).map(order => order.customer);
  const rest = list.length - names.length;
  return {
    count: list.length,
    title: `${list.length} new orders`,
    detail: rest > 0
      ? `${names.join(', ')} and ${rest} other${rest === 1 ? '' : 's'} ordered while you were away.`
      : `${names.join(' and ')} ordered while you were away.`,
  };
}

// ─── Recording a new order without being asked ────────────────────────────
//
// Announcing a sale was half the job. The card said "Dana just ordered" and
// then waited for someone to press Record — so an order that arrived while the
// publisher was packing, or asleep with the laptop open, sat on the screen with
// its stock still on the shelf and no row in the ledger. The next person to
// look at the stock count was looking at a number that was wrong.
//
// These two functions decide which new orders may be recorded unattended, and
// what to tell the publisher afterwards. The recording itself stays in
// features/bigcartel.js, on the same write path the Record button uses.

/** Orders older than this are history catching up, not a sale happening now. */
export const AUTO_RECORD_MAX_AGE_DAYS = 30;

/**
 * Why this order must wait for a person, or '' when it may be recorded now.
 *
 * Everything that returns a reason is a case where moving stock on a guess is
 * worse than waiting: a box with two titles cannot be one ledger row, an item
 * not in the catalogue has no stock to take, a refunded order should not take
 * stock at all, and an order a month old is far likelier to be one the
 * publisher already entered by hand under another number.
 */
export function autoRecordBlocker(order = {}, plan = {}, {
  now = Date.now(),
  maxAgeDays = AUTO_RECORD_MAX_AGE_DAYS,
} = {}) {
  if (normalizeStatus(order) === 'refunded') return 'refunded';
  const created = Date.parse(order?.attributes?.created_at || order?.attributes?.placed_at || '');
  if (Number.isFinite(created) && now - created > maxAgeDays * 86400000) return 'too-old';
  if (plan?.autoSafe) return '';
  if (plan?.confidence === 'mixed') return 'mixed';
  if (plan?.confidence === 'none' || !plan?.presetBookId) return 'unmatched';
  if ((plan?.unmatchedTitles || []).length) return 'unmatched';
  return 'guessed';
}

const REVIEW_REASONS = {
  mixed: 'It has more than one book in it, so choose how to record it',
  unmatched: 'It has something that isn’t in your catalogue',
  guessed: 'The storefront didn’t say clearly which book it was',
  refunded: 'It was already refunded',
  'too-old': 'It’s more than a month old, so check it isn’t already recorded',
  failed: 'It couldn’t be recorded automatically',
};

/** The plain-language reason an order is waiting, for the card and the notification. */
export function reviewReasonText(reason) {
  return REVIEW_REASONS[reason] || REVIEW_REASONS.failed;
}

function copies(n) {
  return `${n} ${n === 1 ? 'copy' : 'copies'}`;
}

/** What the shelf looks like after this sale, in one sentence. */
function stockSentence(outcome) {
  const left = Math.max(0, Number(outcome.stockLeft) || 0);
  const before = Number(outcome.stockBefore);
  if (Number.isFinite(before) && before < (Number(outcome.qty) || 0)) {
    return `You only had ${copies(Math.max(0, before))} on the shelf, so stock is now 0 — worth a recount.`;
  }
  if (left === 0) return 'That was your last copy.';
  const threshold = Number(outcome.threshold);
  if (Number.isFinite(threshold) && left <= threshold) return `Only ${left} left — time to reorder.`;
  return `${left} left in stock.`;
}

function isLow(outcome) {
  const left = Number(outcome.stockLeft);
  const threshold = Number(outcome.threshold);
  return Number.isFinite(left) && Number.isFinite(threshold) && left <= threshold;
}

/**
 * What the card and the device notification say once new orders have been
 * dealt with.
 *
 * Each outcome is one new order plus what happened to it:
 *   'recorded' — the sale is in the ledger and stock came off.
 *   'already'  — it was in the ledger before this check (another device, a scan).
 *   'review'   — it is waiting for the publisher; `reason` says why.
 *   'off'      — automatic recording is switched off; say what `describeNewOrders` says.
 *
 * `needsYou` is true when anything is still waiting, so the caller can lead
 * with the review button rather than the ship button.
 */
export function describeOrderOutcomes(outcomes = []) {
  // An entry with no outcome was only announced, never acted on — the same as 'off'.
  const list = (Array.isArray(outcomes) ? outcomes.filter(Boolean) : [])
    .map(o => (o.outcome ? o : { ...o, outcome: 'off' }));
  if (!list.length) return { title: '', detail: '', count: 0, needsYou: false };
  if (list.every(o => o.outcome === 'off')) return { ...describeNewOrders(list), needsYou: false };

  const recorded = list.filter(o => o.outcome === 'recorded');
  const already = list.filter(o => o.outcome === 'already');
  const waiting = list.filter(o => o.outcome === 'review' || o.outcome === 'failed' || o.outcome === 'off');
  const needsYou = waiting.length > 0;

  if (list.length === 1) {
    const [o] = list;
    if (o.outcome === 'recorded') {
      return {
        count: 1,
        needsYou,
        title: 'New order recorded',
        detail: `${o.customer} bought ${o.qty} × ${o.bookTitle} (${o.num}). ${stockSentence(o)}`,
      };
    }
    if (o.outcome === 'already') {
      return {
        count: 1,
        needsYou,
        title: 'New order',
        detail: `${o.customer} ordered — ${o.num}. It was already in your ledger.`,
      };
    }
    return {
      count: 1,
      needsYou,
      title: 'New order needs you',
      detail: `${o.customer} ordered — ${o.num}. ${reviewReasonText(o.reason)}; stock hasn’t been taken off yet.`,
    };
  }

  const parts = [];
  if (recorded.length) parts.push(`${recorded.length} recorded and stock updated`);
  if (already.length) parts.push(`${already.length} already in your ledger`);
  if (waiting.length) parts.push(`${waiting.length} need${waiting.length === 1 ? 's' : ''} you`);
  let detail = `${parts.join('; ')}.`;

  const low = [];
  recorded.filter(isLow).forEach(o => {
    const label = `${o.bookTitle} (${Math.max(0, Number(o.stockLeft) || 0)} left)`;
    if (!low.includes(label)) low.push(label);
  });
  if (low.length) detail += ` Running low: ${low.join(', ')}.`;

  return {
    count: list.length,
    needsYou,
    title: needsYou ? `${list.length} new orders — ${waiting.length} need${waiting.length === 1 ? 's' : ''} you` : `${list.length} new orders recorded`,
    detail,
  };
}
