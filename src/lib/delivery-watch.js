// Following a parcel after the label is bought.
//
// WHY THIS EXISTS
// Once a label was bought the app stopped caring about the parcel. It knew the
// tracking number, and it already knew how to ask Canada Post about one (the
// tracking-number audit does exactly that), but nobody asked unless they went
// looking. So a parcel sitting at a post office waiting for pickup, or on its
// way back to the shop, was found out the slow way: a customer email three
// weeks later, by which time a claim is harder and the customer is annoyed.
//
// This module decides which shipped orders are worth asking about, how to read
// Canada Post's answer, and what to tell the publisher. Pure — no network, no
// DOM, no ledger — so the rules can be tested directly. shipping.js asks.

import { looksLikeCanadaPostPin, normalizeTrackingPin } from './tracking-audit.js';

/** Parcels older than this are history: delivered, lost, or settled some other way. */
export const DELIVERY_FOLLOW_DAYS = 45;
/** No news from the carrier for this long means somebody should look. */
export const DELIVERY_STUCK_DAYS = 7;
/** How often one parcel is asked about. Carriers update a few times a day at most. */
export const DELIVERY_RECHECK_MS = 12 * 60 * 60 * 1000;
/** Parcels asked about per run, so a busy month cannot become a burst of requests. */
export const DELIVERY_BATCH = 10;

const DAY = 86400000;

function dayMs(value) {
  const parsed = Date.parse(String(value || '').slice(0, 10));
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * The shipped orders to ask Canada Post about this run.
 *
 * `rows` are `{ bookId, entry }` pairs, so the caller can write the answer back
 * onto the ledger row it came from. A row qualifies when it is shipped, not
 * voided, not already delivered, carries a Canada Post tracking number, shipped
 * recently enough to still matter, and was not asked about recently. The ones
 * asked about longest ago go first, so every parcel gets its turn.
 */
export function shipmentsToFollow(rows = [], { now = Date.now(), batch = DELIVERY_BATCH } = {}) {
  const seen = new Set();
  const picked = [];
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const entry = row?.entry;
    if (!entry || entry.voided || !entry.shipped || entry.deliveredDate) return;
    const raw = String(entry.trackingNumber || entry.trackingPin || '').replace(/[\s-]/g, '');
    const pin = normalizeTrackingPin(raw);
    if (!pin || seen.has(pin)) return;
    // Letters mean another carrier (UPS's 1Z…, for one): stripping them would
    // leave a digit run that merely looks like a Canada Post number.
    if (entry.carrier !== 'canadapost' && !(/^\d+$/.test(raw) && looksLikeCanadaPostPin(pin))) return;
    // A parcel handed back to the shop is finished, however recent.
    if (entry.deliveryState === 'returning') return;

    const shipped = dayMs(entry.shippedDate || entry.date);
    if (Number.isFinite(shipped) && now - shipped > DELIVERY_FOLLOW_DAYS * DAY) return;

    const checked = Date.parse(entry.deliveryCheckedAt || '');
    if (Number.isFinite(checked) && now - checked < DELIVERY_RECHECK_MS) return;

    seen.add(pin);
    picked.push({ ...row, pin, checkedAt: Number.isFinite(checked) ? checked : 0 });
  });
  picked.sort((a, b) => a.checkedAt - b.checkedAt);
  return picked.slice(0, Math.max(0, batch));
}

const DELIVERED = /\bdelivered\b|\bitem (was )?delivered\b|\blivr[ée]\b/i;
const NOT_DELIVERED = /\bnot delivered\b|\bundeliver|\bcould not be delivered\b|\bunable to deliver\b/i;
const RETURNING = /return(ed|ing)? to (sender|shipper)|\bundeliverable\b|\brefused\b/i;
const PICKUP = /notice card|ready for pick ?up|available for pick ?up|attempted|held at|pick ?up at/i;

/**
 * Read one tracking answer into a state the ledger can keep.
 *
 *   'delivered' — the customer has it.
 *   'pickup'    — waiting at a post office, or a delivery was attempted; the
 *                 customer has to act, and often doesn't know it.
 *   'returning' — on its way back to the shop.
 *   'stuck'     — no scan for a week or more.
 *   'moving'    — nothing to report.
 *
 * Returns null when the answer carries nothing to read, so an empty response is
 * never mistaken for a parcel that stopped moving.
 */
export function readDelivery(result, { now = Date.now(), shippedDate = '' } = {}) {
  if (!result || !result.found) return null;
  const status = String(result.status || '').trim();
  const eventDate = String(result.eventDateTime || '').slice(0, 10);
  const place = String(result.eventLocation || '').trim();
  const base = { status, eventDate, place };

  const actual = String(result.actualDeliveryDate || '').slice(0, 10);
  if (actual || (DELIVERED.test(status) && !NOT_DELIVERED.test(status))) {
    return { ...base, state: 'delivered', deliveredDate: actual || eventDate || new Date(now).toISOString().slice(0, 10) };
  }
  if (RETURNING.test(status)) return { ...base, state: 'returning' };
  if (PICKUP.test(status) || result.attemptedDate) return { ...base, state: 'pickup' };

  const lastMove = dayMs(eventDate || shippedDate);
  if (Number.isFinite(lastMove) && now - lastMove >= DELIVERY_STUCK_DAYS * DAY) {
    return { ...base, state: 'stuck' };
  }
  return { ...base, state: 'moving' };
}

/**
 * Whether this reading is news: a state the order has not been in before.
 * 'moving' is never news. The same problem is announced once, not every run.
 */
export function isDeliveryNews(previousState, reading) {
  if (!reading || reading.state === 'moving') return false;
  return reading.state !== previousState;
}

const PROBLEM_STATES = ['returning', 'pickup', 'stuck'];

function problemLine(item) {
  const who = item.customer || item.num || 'A parcel';
  if (item.state === 'returning') return `${who}'s parcel is on its way back to you`;
  if (item.state === 'pickup') return `${who}'s parcel is waiting at a post office${item.place ? ` (${item.place})` : ''}`;
  return `${who}'s parcel hasn't moved in over a week`;
}

/**
 * What to tell the publisher after a run. Problems lead, because they are the
 * only part she can act on; deliveries are good news worth one line.
 */
export function describeDeliveryNews(news = []) {
  const list = (Array.isArray(news) ? news : []).filter(Boolean);
  const problems = list.filter(item => PROBLEM_STATES.includes(item.state));
  const delivered = list.filter(item => item.state === 'delivered');
  if (!problems.length && !delivered.length) return { count: 0, title: '', detail: '', needsYou: false };

  const deliveredLine = delivered.length === 1
    ? `${delivered[0].customer || delivered[0].num} has received their order.`
    : `${delivered.length} parcels were delivered.`;

  if (!problems.length) {
    return {
      count: delivered.length,
      needsYou: false,
      title: delivered.length === 1 ? 'Parcel delivered' : `${delivered.length} parcels delivered`,
      detail: deliveredLine,
    };
  }

  const shown = problems.slice(0, 2).map(problemLine);
  const more = problems.length - shown.length;
  let detail = `${shown.join('. ')}${more > 0 ? `, and ${more} more need${more === 1 ? 's' : ''} a look` : ''}.`;
  if (problems.some(item => item.state === 'pickup')) detail += ' A quick email to the customer usually sorts it.';
  if (delivered.length) detail += ` ${deliveredLine}`;
  return {
    count: list.length,
    needsYou: true,
    title: problems.length === 1 ? 'A parcel needs a look' : `${problems.length} parcels need a look`,
    detail,
  };
}
