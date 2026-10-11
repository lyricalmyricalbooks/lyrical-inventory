// The website ↔ inventory app link, as pure rules.
//
// The shop's website writes each paid order into an inbox in this app's
// database (`websiteOrders/{orderId}`, contract in docs/website-link.md). This
// module decides, with no DOM and no Firebase, what that order means for the
// ledger:
//
//   - which `hist` row each book should end up with (desiredWebsiteRows),
//   - whether a sale already in the books is that order (matchExistingRows),
//   - what has to change on a row (rowPatch) and what the copies add up to
//     (webOrderEffect),
//   - the stock number the website follows (websiteStockFeed),
//   - and the label to send back when postage for a website order was bought
//     here (appShipmentFor).
//
// The inventory app is the master count. A website order arrives as an
// ordinary sale row, so every existing stock rule (deriveOnHand, the Stock
// After walk, the merge) treats it exactly like a sale typed in by hand.
//
// planWebsitePublish is the decision half of the one transaction that marks
// orders done and publishes the stock feed: src/firebase.js reads the server's
// copy of the books and the orders, hands them to it, and writes what it
// returns. Keeping that here is what makes the transaction testable.

import { roundCents, normalizeCurrencyCode } from './money.js';
import { normalizeShippingOrderNumber } from './shipping-reconciliation.js';
import { countryName } from './countries.js';
import { deriveOnHandRaw, deriveStockBreakdown } from './inventory.js';
import { isPostageExpense, isPostageLinked } from './postage-matching.js';
import { refundState } from './label-refunds.js';
import { stableStringify } from './merge-state.js';

/** The `web` shape this build understands. */
export const WEB_ORDER_VERSION = 1;
/** Orders handled per run, so a big backfill can't freeze the screen. */
export const WEBSITE_IMPORT_BATCH = 50;
/** How far apart two dates can be and still look like the same sale. */
export const WEAK_MATCH_DAYS = 3;
/** Website fulfilment states that mean the parcel has left (or been collected). */
export const WEBSITE_SHIPPED_STATES = new Set(['shipped', 'out_for_delivery', 'delivered', 'collected']);
/** Payment states the website pushes. Anything else is held for a person. */
const PAYMENT_STATES = new Set(['paid', 'refund_pending', 'refunded']);
/** Where a label can come from, as the website expects it. */
const LABEL_SOURCES = new Set(['canadapost', 'chitchats', 'shippo', 'hand']);

const clean = (value) => String(value ?? '').trim();
const wholeCopies = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const money = (value) => roundCents(Number(value) || 0);
const dayOf = (value) => (/^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : '');
const same = (a, b) => stableStringify(a) === stableStringify(b);
const httpUrl = (value) => (/^https?:\/\//i.test(clean(value)) ? clean(value) : '');
const dayMs = (day) => Date.parse(`${day}T12:00:00Z`);

/**
 * Device storage for "this Stripe charge belongs to that PaymentIntent", kept
 * from every Stripe pull. A sale recorded from Stripe Reconcile is keyed by its
 * charge (`stripe-<chargeId>`) while the website names the PaymentIntent, so
 * this is how such a sale is recognised as a website order after a reload.
 */
export const STRIPE_CHARGE_PI_KEY = 'lm-stripe-charge-pi';
const CHARGE_PI_LIMIT = 800;

/** Adds `{ id, piId }` payments to the charge → PaymentIntent map, newest kept. */
export function rememberChargeIntents(map = {}, payments = [], limit = CHARGE_PI_LIMIT) {
  const out = { ...(map && typeof map === 'object' ? map : {}) };
  for (const p of payments || []) {
    const charge = clean(p && p.id);
    const pi = clean(p && p.piId);
    if (!charge || !pi) continue;
    delete out[charge]; // re-insert so it counts as the newest
    out[charge] = pi;
  }
  const keys = Object.keys(out);
  if (keys.length > limit) keys.slice(0, keys.length - limit).forEach(k => { delete out[k]; });
  return out;
}

/** The deterministic row id for one order and one book, the same on every device. */
export function webRowUid(orderId, bookId) {
  return `web-${clean(orderId)}-${clean(bookId)}`;
}

/**
 * The order number the app files the sale under. The website sends
 * `#ABCD-123456-WXYZ` (or `#WEB-<24 hex>` for manual payments); the app's order
 * matching needs a hyphen, so an id without one is given the WEB- prefix.
 */
export function websiteOrderNumber(web = {}) {
  const sent = normalizeShippingOrderNumber(web && web.number);
  if (sent) return sent;
  const id = clean(web && web.orderId).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!id) return '';
  return id.includes('-') ? normalizeShippingOrderNumber(id) || `#${id}` : `#WEB-${id}`;
}

/** True for a row the website link wrote or adopted. */
export function isWebsiteRow(row) {
  return !!(row && row.webOrderId);
}

/**
 * True when the row carries a tracking number this app set — a label bought
 * here, or one linked by hand — rather than one the website sent over or one
 * the row already had when it was linked. A test-mode label never counts: its
 * number never scans and must never reach a customer.
 */
export function hasAppTracking(row) {
  const tracking = clean(row && row.trackingNumber);
  if (!tracking || (row && row.trackingSimulated)) return false;
  return tracking !== clean(row.webTracking) && tracking !== clean(row.webBaselineTracking);
}

/**
 * Whether a website order is the website's to pack. True while the website is
 * handling it and once it has shipped it; false as soon as the owner buys or
 * links a label for it here, so it can be followed like any other parcel.
 */
export function isWebsiteFulfilled(row) {
  if (!row || !row.webOrderId || row.fulfilledOnWebsite === false) return false;
  return !hasAppTracking(row);
}

/** Books on the order that should end up with a row (any copy sold). */
export function webBookIdsWithRows(web = {}) {
  const books = web && web.books && typeof web.books === 'object' ? web.books : {};
  return Object.keys(books).filter(id => {
    const b = books[id] || {};
    return wholeCopies(b.sold) > 0 || wholeCopies(b.net) > 0;
  });
}

function orderedBookIds(web) {
  const ids = webBookIdsWithRows(web);
  const first = ids.includes(web.firstBook) ? web.firstBook : [...ids].sort()[0];
  return ids.sort((a, b) => {
    if (a === first) return -1;
    if (b === first) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function shippingMethodOf(method) {
  if (method === 'pickup') return 'Pickup';
  if (method === 'local_delivery') return 'Local delivery';
  return method ? 'Shipping' : '';
}

/**
 * The `hist` row each book on a website order should have, built from `web`
 * alone.
 *
 * - One row per book (inventory book id), `qty` = copies that left the shelf
 *   and stayed gone (`net`).
 * - CAD books are priced at `unitCAD`. A book priced in another currency is
 *   converted with the dated rate `cadRateFor(currency, day)` returns (CAD per
 *   one unit of that currency), and the rate is stamped on the row. With no
 *   rate the book goes to `needsRate` instead of being guessed.
 * - Refunded with every copy back on the shelf (`net` 0): the row is voided.
 *   Refunded in full with copies still gone: the row stays, `gratuity:true`,
 *   price 0 — the copies are gone and no money stayed.
 * - The order's shipping, tax, discount and totals ride on the first book's
 *   row only, so a two-book order is not charged shipping twice.
 * - Tracking and the shipped flag come from `web.fulfillment`, except a label
 *   this app sent the website itself (`labelSource: 'inventory-app'`).
 *
 * @returns {{ rows: Array<{bookId: string, row: object}>, needsRate: Array<{bookId, currency, day}> }}
 */
export function desiredWebsiteRows(web = {}, { bookCurrencyOf = () => 'CAD', cadRateFor = () => null, shipmentReply = null } = {}) {
  const out = { rows: [], needsRate: [] };
  const orderId = clean(web && web.orderId);
  if (!orderId) return out;
  const books = web.books && typeof web.books === 'object' ? web.books : {};
  const ids = orderedBookIds(web);
  const first = ids[0];
  const num = websiteOrderNumber(web);
  const day = dayOf(web.paidDay) || dayOf(web.paidAt);
  const ff = web.fulfillment && typeof web.fulfillment === 'object' ? web.fulfillment : {};
  const customer = web.customer && typeof web.customer === 'object' ? web.customer : {};
  const address = customer.address && typeof customer.address === 'object' ? customer.address : {};
  const totals = web.totals && typeof web.totals === 'object' ? web.totals : {};
  const refundedFull = web.refundState === 'full' || web.paymentStatus === 'refunded';
  const websiteTracking = ff.labelSource !== 'inventory-app' ? clean(ff.trackingNumber) : '';
  const shipped = WEBSITE_SHIPPED_STATES.has(ff.status);
  const voidedAt = Date.parse(web.sourceUpdatedAt || '') || Date.parse(web.paidAt || '') || 0;
  const reply = shipmentReply && typeof shipmentReply === 'object' && clean(shipmentReply.hash)
    ? { hash: clean(shipmentReply.hash), result: clean(shipmentReply.result), reason: clean(shipmentReply.reason), at: clean(shipmentReply.at) }
    : null;

  for (const bookId of ids) {
    const b = books[bookId] || {};
    const sold = wholeCopies(b.sold);
    const net = Number.isFinite(Number(b.net)) ? wholeCopies(b.net) : Math.max(0, sold - wholeCopies(b.restocked));
    const voided = net <= 0;
    const gratuity = !voided && refundedFull;
    const cur = normalizeCurrencyCode(bookCurrencyOf(bookId), 'CAD');
    const unitCAD = money(b.unitCAD);
    const qty = voided ? Math.max(1, sold) : net;

    let price = 0;
    let payment;
    let cadRate;
    if (!gratuity) {
      if (cur === 'CAD') {
        price = unitCAD;
      } else {
        const rate = Number(cadRateFor(cur, day));
        if (rate > 0 && Number.isFinite(rate)) {
          cadRate = rate;
          price = money(unitCAD / rate);
          payment = {
            currency: 'CAD',
            amount: money(qty * unitCAD),
            rate: Math.round((1 / rate) * 1e6) / 1e6,
            convertedTotal: money(qty * price),
            rateSource: 'dated',
            rateDate: day,
          };
        } else if (!voided) {
          // A live sale can't be priced without the day's rate. A voided row
          // moves nothing, so it is recorded at 0 rather than held up.
          out.needsRate.push({ bookId, currency: cur, day });
          continue;
        }
      }
    }

    const isFirst = bookId === first;
    const uid = webRowUid(orderId, bookId);
    const row = {
      uid,
      sheetsId: uid,
      webOrderId: orderId,
      webHash: clean(web.hash),
      chan: 'Website',
      num,
      date: day,
      qty,
      price,
      cur,
      notes: `Website${clean(web.paymentMethod) ? ` · ${clean(web.paymentMethod)}` : ''}`,
      fulfilledOnWebsite: true,
      voided,
      gratuity,
      webRefunded: refundedFull,
      webRefundState: clean(web.refundState) || 'none',
      webPaymentStatus: clean(web.paymentStatus),
      webFulfillmentStatus: clean(ff.status),
      webTracking: websiteTracking,
      shipName: clean(customer.name),
      shipEmail: clean(customer.email),
      shipPhone: clean(customer.phone),
      shipAddr1: clean(address.street),
      shipAddr2: clean(address.unit),
      shipCity: clean(address.city),
      shipProvince: clean(address.state),
      shipPostal: clean(address.zip),
      shipCountry: clean(address.country) ? countryName(address.country) : '',
      shippingMethod: shippingMethodOf(clean(ff.method)),
      merchandisePaid: gratuity ? 0 : money(b.merchCAD),
      subtotal: isFirst ? money(totals.subtotal) : 0,
      discountAmount: isFirst ? money(totals.discount) : 0,
      discountCode: isFirst ? clean(totals.discountCode) : '',
      discountSource: isFirst && money(totals.discount) > 0 ? 'website' : '',
      shippingPaid: isFirst ? money(totals.shipping) : 0,
      taxPaid: isFirst ? money(totals.tax) : 0,
      totalPaid: isFirst ? money(totals.total) : 0,
      giftCardPaid: isFirst ? money(totals.giftCard) : 0,
    };
    // Every value comes from `web`, so two devices bringing in the same order
    // write the same row and the merge sees one sale, not a clash.
    if (clean(web.paidAt)) row.recordedAt = clean(web.paidAt);
    if (voided && voidedAt) row.voidedAt = voidedAt;
    if (cadRate) row.cadRate = cadRate;
    if (payment) row.payment = payment;
    if (b.preorder) row.preorder = true;
    if (websiteTracking) {
      row.trackingNumber = websiteTracking;
      row.trackingSource = 'website';
      if (clean(ff.trackingCarrier)) row.trackingCarrier = clean(ff.trackingCarrier);
      if (httpUrl(ff.trackingUrl)) row.trackingUrl = httpUrl(ff.trackingUrl);
    }
    if (shipped) {
      row.shipped = true;
      row.shippedDate = dayOf(ff.shippedDay) || day;
    }
    if (reply) row.webShipment = reply;
    out.rows.push({ bookId, row });
  }
  return out;
}

// Fields a person may have edited by hand and the website does not own.
const APP_OWNED = new Set(['notes', 'after', 'recordedAt', 'enteredBy']);
// Fields that only follow the website while the row has no tracking of its own.
const TRACKING_KEYS = new Set(['trackingNumber', 'trackingCarrier', 'trackingUrl', 'trackingSource', 'shipped', 'shippedDate']);

/**
 * What has to change on `existing` to make it the website's row. `null` when
 * nothing does.
 *
 * - A linked row keeps its own `sheetsId`, so its Google Sheet row and the
 *   Stripe "already recorded" check stay attached to it.
 * - Notes and who entered it stay as the owner left them.
 * - Tracking set in this app (or already on a row when it is linked) is never
 *   overwritten by the website's, and a row the website once called shipped is
 *   never un-shipped by a later push.
 * - A row linked with a tracking number already on it remembers that number
 *   (`webBaselineTracking`), so an old parcel is never sent to the website as
 *   new postage — that would email the customer about a parcel long gone.
 */
export function rowPatch(existing = {}, desired = {}) {
  const ex = existing || {};
  const patch = {};
  const tracking = clean(ex.trackingNumber);
  const ownTracking = !!tracking && tracking !== clean(ex.webTracking) && tracking !== clean(desired.webTracking);
  if (!ex.webOrderId && ownTracking && !ex.webBaselineTracking) patch.webBaselineTracking = tracking;

  for (const [key, value] of Object.entries(desired || {})) {
    if (value === undefined || APP_OWNED.has(key)) continue;
    if (key === 'sheetsId' && clean(ex.sheetsId)) continue;
    if (TRACKING_KEYS.has(key)) {
      if (ownTracking) continue;
      if (key === 'shipped' && ex.shipped && !value) continue;
    }
    if (!same(ex[key], value)) patch[key] = value;
  }
  return Object.keys(patch).length ? patch : null;
}

/** A stable handle on a row for a decision made about it later. */
export function rowKey(row) {
  if (!row || typeof row !== 'object') return '';
  if (clean(row.uid)) return `uid:${clean(row.uid)}`;
  if (clean(row.sheetsId)) return `sid:${clean(row.sheetsId)}`;
  return `c:${stableStringify({ num: row.num ?? null, date: row.date ?? null, qty: row.qty ?? null, price: row.price ?? null, chan: row.chan ?? null })}`;
}

function indexesWhere(list, test) {
  const out = [];
  (list || []).forEach((row, i) => { if (test(row, i)) out.push(i); });
  return out;
}

/**
 * Finds what is already in the books for each book on a website order.
 *
 * Per book, one of:
 *   own    — the row this link wrote (same uid, or tagged with this order)
 *   adopt  — a sale entered by hand that is plainly this order: same order
 *            number, the `bc-` id the Gmail import gives it, or a Stripe sale
 *            whose payment belongs to the order's PaymentIntent — and the same
 *            number of copies. It is tagged, never counted twice.
 *   new    — nothing like it; add a row
 *   review — something like it that a person should look at: a strong match
 *            with a different number of copies or void state, several strong
 *            matches, or a sale within three days with the same copies and the
 *            same email or amount.
 * Plus `replace` for a hand sale under a book the website did not sell, once
 * the owner has said it is the same sale (it is voided; the website's row is
 * added in the right book).
 *
 * `decisions[bookId]` holds what the owner chose in the review list:
 * `{ choice: 'same', key }` or `{ choice: 'different' }`.
 */
export function matchExistingRows(web = {}, desired = [], histByBook = {}, {
  piOfCharge = () => '',
  decisions = {},
  bookCurrencyOf = () => 'CAD',
} = {}) {
  const orderId = clean(web.orderId);
  const num = websiteOrderNumber(web);
  const bcId = num ? `BC-${num.replace(/^#/, '')}` : '';
  const pi = clean(web.stripePaymentIntentId);
  const day = dayOf(web.paidDay) || dayOf(web.paidAt);
  const email = clean(web.customer && web.customer.email).toLowerCase();
  const charged = web.charged && typeof web.charged === 'object' ? web.charged : {};
  const chargedCur = normalizeCurrencyCode(charged.currency, '');
  const chargedAmount = Number(charged.amountMinor) / 100;
  const books = web.books && typeof web.books === 'object' ? web.books : {};
  const totals = web.totals && typeof web.totals === 'object' ? web.totals : {};
  const decided = decisions && typeof decisions === 'object' ? decisions : {};

  const isStrong = (h) => {
    if (!h || typeof h !== 'object' || h.consignmentLink) return false;
    if (h.webOrderId && h.webOrderId !== orderId) return false;
    if (h.webReplacedBy) return false;
    if (num && normalizeShippingOrderNumber(h.num) === num) return true;
    const sid = clean(h.sheetsId);
    if (bcId && sid.toUpperCase() === bcId) return true;
    // A split reader sale's later rows carry "-2", "-3"; they share the charge.
    if (pi && sid.startsWith('stripe-') && clean(piOfCharge(sid.slice('stripe-'.length).replace(/-\d+$/, ''))) === pi) return true;
    return false;
  };

  const sameAmount = (h, bookId) => {
    const qty = Number(h.qty) || 0;
    const total = qty * (Number(h.price) || 0);
    const pay = h.payment;
    if (pay && chargedCur && normalizeCurrencyCode(pay.currency, '') === chargedCur
      && Number.isFinite(chargedAmount) && Math.abs((Number(pay.amount) || 0) - chargedAmount) < 0.005) return true;
    if (normalizeCurrencyCode(bookCurrencyOf(bookId), 'CAD') !== 'CAD') return false;
    const b = books[bookId] || {};
    return Math.abs(total - (Number(b.merchCAD) || 0)) < 0.005 || Math.abs(total - (Number(totals.total) || 0)) < 0.005;
  };

  // What makes a sale look like this order: within three days, the same
  // copies, and the same customer email or the same amount. Null when not.
  const weakMatch = (h, bookId) => {
    if (!h || typeof h !== 'object' || h.webOrderId || h.voided || h.consignmentLink || h.gratuity || h.webReplacedBy) return null;
    const a = dayMs(dayOf(h.date));
    const b = dayMs(day);
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > WEAK_MATCH_DAYS * 86400000) return null;
    if (Number(h.qty) !== wholeCopies((books[bookId] || {}).sold)) return null;
    const viaEmail = !!email && clean(h.shipEmail).toLowerCase() === email;
    const viaAmount = sameAmount(h, bookId);
    return viaEmail || viaAmount ? { sameEmail: viaEmail, sameAmount: viaAmount } : null;
  };

  const results = [];
  const review = [];
  const desiredIds = new Set();
  for (const { bookId, row: d } of desired || []) {
    desiredIds.add(bookId);
    const hist = Array.isArray(histByBook[bookId]) ? histByBook[bookId] : [];
    const own = hist.findIndex(h => h && (h.uid === d.uid || h.webOrderId === orderId));
    if (own !== -1) { results.push({ bookId, kind: 'own', index: own, key: rowKey(hist[own]) }); continue; }

    const decision = decided[bookId] || null;
    if (decision && decision.choice === 'different') { results.push({ bookId, kind: 'new' }); continue; }
    if (decision && decision.choice === 'same' && decision.key) {
      const chosen = hist.findIndex(h => rowKey(h) === decision.key);
      if (chosen !== -1) { results.push({ bookId, kind: 'adopt', index: chosen, key: decision.key, decided: true }); continue; }
    }

    const strong = indexesWhere(hist, isStrong);
    if (strong.length > 1) {
      review.push({ bookId, reason: 'several', candidates: strong.map(i => ({ index: i, key: rowKey(hist[i]), row: hist[i] })) });
      continue;
    }
    if (strong.length === 1) {
      const i = strong[0];
      const h = hist[i];
      const qtyOk = Number(h.qty) === wholeCopies((books[bookId] || {}).sold) || Number(h.qty) === d.qty;
      const voidOk = !!h.voided === !!d.voided;
      if (qtyOk && voidOk) { results.push({ bookId, kind: 'adopt', index: i, key: rowKey(h) }); continue; }
      review.push({ bookId, reason: qtyOk ? 'voided' : 'qty', candidates: [{ index: i, key: rowKey(h), row: h }] });
      continue;
    }
    const weak = indexesWhere(hist, h => !!weakMatch(h, bookId));
    if (weak.length) {
      review.push({ bookId, reason: 'weak', candidates: weak.map(i => ({ index: i, key: rowKey(hist[i]), row: hist[i], ...weakMatch(hist[i], bookId) })) });
      continue;
    }
    results.push({ bookId, kind: 'new' });
  }

  // The same order recorded under a book the website didn't sell.
  for (const [bookId, histRaw] of Object.entries(histByBook || {})) {
    if (desiredIds.has(bookId)) continue;
    const hist = Array.isArray(histRaw) ? histRaw : [];
    const strong = indexesWhere(hist, h => isStrong(h) && !h.voided && !h.webOrderId);
    if (!strong.length) continue;
    const decision = decided[bookId] || null;
    if (decision && decision.choice === 'different') continue;
    if (decision && decision.choice === 'same' && decision.key) {
      const chosen = hist.findIndex(h => rowKey(h) === decision.key);
      if (chosen !== -1) { results.push({ bookId, kind: 'replace', index: chosen, key: decision.key, decided: true }); continue; }
    }
    review.push({ bookId, reason: 'book', candidates: strong.map(i => ({ index: i, key: rowKey(hist[i]), row: hist[i] })) });
  }

  return { results, review };
}

/**
 * Copies on the server per book for one order: the non-voided rows tagged
 * with it. What the website's own `net` should equal once the order is in.
 */
export function webOrderEffect(histByBook = {}, orderId) {
  const out = {};
  for (const [bookId, hist] of Object.entries(histByBook || {})) {
    for (const h of (Array.isArray(hist) ? hist : [])) {
      if (!h || h.webOrderId !== orderId) continue;
      out[bookId] = (out[bookId] || 0) + (h.voided ? 0 : wholeCopies(h.qty));
    }
  }
  return out;
}

/** The effect a set of desired rows will have once saved. */
export function plannedEffect(rows = []) {
  const out = {};
  for (const { bookId, row } of rows || []) out[bookId] = (out[bookId] || 0) + (row.voided ? 0 : wholeCopies(row.qty));
  return out;
}

/** Two effects agree when every book has the same copies (a missing book is 0). */
export function sameEffect(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) if ((Number((a || {})[k]) || 0) !== (Number((b || {})[k]) || 0)) return false;
  return true;
}

/**
 * Everything one pending website order needs, decided in one place.
 *
 * `ctx`:
 *   histByBook       { bookId: hist[] } — this device's books
 *   knowsBook(id)    the book is in the catalogue
 *   canWrite(id)     the book is loaded and on Firestore (an old-storage book
 *                    can't be checked inside the publish transaction)
 *   bookCurrencyOf, cadRateFor, piOfCharge — see the functions above
 *   decisions        this order's review choices
 *
 * status:
 *   ready   — `actions` (possibly none) make the books match; `effect` is
 *             what the marking transaction will check on the server
 *   review  — `reasons` say what a person has to decide
 *   blocked — `blocked` lists books that must move to the new storage first
 *   test    — a website rehearsal order; `preview` says what it would do
 */
export function planWebsiteOrder(doc = {}, ctx = {}) {
  const web = doc && doc.web && typeof doc.web === 'object' ? doc.web : {};
  const orderId = clean(web.orderId) || clean(doc && doc.id);
  const reply = doc && doc.shipmentReply && typeof doc.shipmentReply === 'object' ? doc.shipmentReply : null;
  const unlinked = (Array.isArray(web.unlinked) ? web.unlinked : [])
    .map(u => ({ title: clean(u && u.title), qty: wholeCopies(u && u.qty) }))
    .filter(u => u.qty > 0);
  const base = {
    orderId,
    hash: clean(web.hash),
    num: websiteOrderNumber({ ...web, orderId }),
    day: dayOf(web.paidDay) || dayOf(web.paidAt),
    customer: clean(web.customer && web.customer.name),
    unlinked,
    replyAt: reply ? clean(reply.at) : '',
    replyHash: reply ? clean(reply.hash) : '',
    actions: [],
    reasons: [],
    blocked: [],
    effect: {},
    decisions: ctx.decisions || {},
  };
  if (!orderId || !doc || !doc.web) return { ...base, status: 'review', reasons: [{ reason: 'empty' }] };
  if (Number(web.v) !== WEB_ORDER_VERSION) return { ...base, status: 'review', reasons: [{ reason: 'version' }] };

  const desired = desiredWebsiteRows({ ...web, orderId }, {
    bookCurrencyOf: ctx.bookCurrencyOf, cadRateFor: ctx.cadRateFor, shipmentReply: reply,
  });

  if (web.test === true) {
    const rate = desired.needsRate.map(n => ({ bookId: n.bookId, copies: wholeCopies((web.books || {})[n.bookId]?.net) }));
    return {
      ...base,
      status: 'test',
      preview: [...desired.rows.map(({ bookId, row }) => ({ bookId, copies: row.voided ? 0 : row.qty })), ...rate],
    };
  }
  if (!PAYMENT_STATES.has(web.paymentStatus)) return { ...base, status: 'review', reasons: [{ reason: 'status' }] };

  const involved = webBookIdsWithRows(web);
  const knowsBook = typeof ctx.knowsBook === 'function' ? ctx.knowsBook : () => true;
  const canWrite = typeof ctx.canWrite === 'function' ? ctx.canWrite : () => true;
  const unknown = involved.filter(id => !knowsBook(id));
  if (unknown.length) return { ...base, status: 'review', reasons: unknown.map(bookId => ({ bookId, reason: 'unknown-book' })) };
  const blocked = involved.filter(id => !canWrite(id));
  if (blocked.length) return { ...base, status: 'blocked', blocked };
  if (desired.needsRate.length) {
    return { ...base, status: 'review', reasons: desired.needsRate.map(n => ({ bookId: n.bookId, reason: 'rate', currency: n.currency, day: n.day })) };
  }

  const histByBook = ctx.histByBook || {};
  const match = matchExistingRows({ ...web, orderId }, desired.rows, histByBook, {
    piOfCharge: ctx.piOfCharge, decisions: ctx.decisions, bookCurrencyOf: ctx.bookCurrencyOf,
  });
  if (match.review.length) return { ...base, status: 'review', reasons: match.review };

  const desiredBy = new Map(desired.rows.map(r => [r.bookId, r.row]));
  const actions = [];
  for (const r of match.results) {
    if (r.kind === 'new') { actions.push({ kind: 'new', bookId: r.bookId, row: desiredBy.get(r.bookId) }); continue; }
    if (r.kind === 'replace') { actions.push({ kind: 'replace', bookId: r.bookId, key: r.key, replacedBy: orderId }); continue; }
    const existing = (histByBook[r.bookId] || [])[r.index];
    const patch = rowPatch(existing, desiredBy.get(r.bookId));
    actions.push({ kind: r.kind, bookId: r.bookId, key: r.key, uid: desiredBy.get(r.bookId).uid, patch });
  }
  return { ...base, status: 'ready', actions, effect: plannedEffect(desired.rows) };
}

/**
 * One line per plan for the first-run summary:
 * "X new · Y already in your books (will be linked) · Z need you".
 */
export function summarizePlans(plans = []) {
  let fresh = 0, linked = 0, needYou = 0, blocked = 0, tests = 0, upToDate = 0;
  for (const p of plans || []) {
    if (!p) continue;
    if (p.status === 'review') needYou++;
    else if (p.status === 'blocked') blocked++;
    else if (p.status === 'test') tests++;
    else if (p.status === 'ready') {
      if (p.actions.some(a => a.kind === 'adopt' || a.kind === 'replace')) linked++;
      else if (p.actions.some(a => a.kind === 'new')) fresh++;
      else upToDate++;
    }
  }
  return { fresh, linked, needYou, blocked, tests, upToDate };
}

/**
 * The numbers the website sets its stock from, for one book.
 *
 *   onHand    publisher-held copies now (author-held copies aren't the
 *             website's to sell), never below 0
 *   webCopies copies on this book's non-voided website rows
 *   base      unfloored on-hand + webCopies − author-held copies. Importing a
 *             website order lowers on-hand and raises webCopies by the same
 *             amount, so base doesn't move: the website's figure is right
 *             whether or not the order has been brought in yet.
 *   derived   false when the book has no print run, so the count is only
 *             whatever was last typed in and the website should not trust it
 */
export function websiteStockFeed(state = {}, book = {}) {
  const s = state && typeof state === 'object' ? state : {};
  const bk = book && typeof book === 'object' ? book : {};
  const raw = deriveOnHandRaw(s, bk);
  const { publisherOnHand, authorHeld } = deriveStockBreakdown(s, bk);
  let webCopies = 0;
  for (const h of (Array.isArray(s.hist) ? s.hist : [])) {
    if (h && h.webOrderId && !h.voided && !h.consignmentLink) webCopies += wholeCopies(h.qty);
  }
  return {
    bookId: clean(bk.id),
    title: clean(bk.title),
    onHand: Math.max(0, Math.floor(Number(publisherOnHand) || 0)),
    webCopies,
    // `|| 0` turns a -0 into 0: Firestore stores -0 as a double, and the
    // security rules require whole numbers here.
    base: Math.floor((Number(raw) || 0) + webCopies - (Number(authorHeld) || 0)) || 0,
    derived: Number.isFinite(bk.maxPrint),
  };
}

const CARRIER_NAMES = {
  canadapost: 'Canada Post',
  chitchats: 'Chit Chats',
  usps: 'USPS',
  ups: 'UPS',
  fedex: 'FedEx',
  dhl: 'DHL',
  dhlexpress: 'DHL Express',
  purolator: 'Purolator',
};

/** "canadapost" → "Canada Post"; anything unknown passes through as written. */
export function carrierLabel(value) {
  const text = clean(value);
  if (!text) return '';
  return CARRIER_NAMES[text.toLowerCase().replace(/[\s_-]+/g, '')] || text;
}

/**
 * The postage linked to an order in the Tax Centre, summed: what the website
 * shows as the label's cost. Refunded and test-mode labels don't count.
 * `costCAD` is null when any label's CAD value isn't known yet.
 */
export function linkedPostageFor(orderNumber, expenses = []) {
  const wanted = normalizeShippingOrderNumber(orderNumber);
  if (!wanted) return null;
  const list = Array.isArray(expenses) ? expenses : [];
  const labels = list.filter(e => e && !e.simulated && isPostageExpense(e) && isPostageLinked(e)
    && refundState(e, list) === 'none'
    && normalizeShippingOrderNumber(e.shippingOrderNumber) === wanted);
  if (!labels.length) return null;
  let cost = 0;
  let known = true;
  for (const e of labels) {
    const cad = e.baseAmount != null && !e.fxMissing
      ? Number(e.baseAmount)
      : (String(e.currency || '').toUpperCase() === 'CAD' ? Number(e.amount) : NaN);
    if (Number.isFinite(cad)) cost += cad; else known = false;
  }
  const latest = labels.reduce((a, b) => (String(b.date || '') > String(a.date || '') ? b : a));
  const ref = String(latest.ref || '');
  const source = ref.startsWith('shippo:') ? 'shippo'
    : ref.startsWith('canadapost:') ? 'canadapost'
      : ref.startsWith('chitchats:') ? 'chitchats'
        : 'hand';
  return {
    costCAD: known ? roundCents(cost) : null,
    source,
    carrier: clean(latest.trackingCarrier || latest.carrier),
    service: clean(latest.serviceName || latest.service),
    boughtAt: dayOf(latest.date) || null,
    trackingNumber: clean(latest.trackingNumber),
  };
}

/** The deterministic hash the website echoes: tracking number | carrier | shipped date. */
export function shipmentHash(shipment = {}) {
  return `${clean(shipment.trackingNumber)}|${clean(shipment.carrier)}|${clean(shipment.shippedAt)}`;
}

/**
 * The label to send the website for one order, or null.
 *
 * Read off the order's rows, so every way this app puts tracking on an order
 * (Canada Post, Chit Chats, Shippo, a hand-linked receipt) is covered without
 * a hook in each. Null when no row carries tracking this app set — and never
 * an echo of tracking that came from the website itself.
 *
 * `linkedPostage` (linkedPostageFor) adds the cost, the service and when the
 * label was bought; it is not part of the hash, so a cost arriving later
 * doesn't send the same parcel twice.
 */
export function appShipmentFor(rows = [], linkedPostage = null, web = null) {
  const live = (Array.isArray(rows) ? rows : []).filter(r => r && r.webOrderId && !r.voided);
  const r = live.find(hasAppTracking);
  if (!r) return null;
  const trackingNumber = clean(r.trackingNumber);
  const ff = web && web.fulfillment && typeof web.fulfillment === 'object' ? web.fulfillment : {};
  if (clean(ff.trackingNumber) === trackingNumber && ff.labelSource !== 'inventory-app') return null;
  const lp = linkedPostage && typeof linkedPostage === 'object' ? linkedPostage : {};
  const code = clean(r.carrier).toLowerCase();
  const labelSource = code === 'canadapost' || code === 'chitchats'
    ? code
    : (LABEL_SOURCES.has(lp.source) ? lp.source : 'hand');
  const shipment = {
    carrier: carrierLabel(r.trackingCarrier || r.carrier || lp.carrier),
    service: clean(lp.service),
    trackingNumber,
    trackingUrl: httpUrl(r.trackingUrl),
    labelCostCAD: Number.isFinite(lp.costCAD) ? roundCents(lp.costCAD) : null,
    labelSource,
    boughtAt: lp.boughtAt || null,
    shippedAt: r.shipped ? (dayOf(r.shippedDate) || lp.boughtAt || null) : null,
  };
  shipment.hash = shipmentHash(shipment);
  return shipment;
}

/**
 * What to say about a website order's parcel, in plain words. `shipment` is
 * appShipmentFor for the order; `sentHash` the last one this device sent.
 * @returns {{ tone: 'positive'|'active'|'critical'|'neutral', text: string, next?: string } | null}
 */
export function describeWebShipment(row, shipment, { sentHash = '' } = {}) {
  if (!row || !row.webOrderId || row.voided) return null;
  if (!shipment) {
    if (WEBSITE_SHIPPED_STATES.has(row.webFulfillmentStatus)) {
      return { tone: 'positive', text: row.webFulfillmentStatus === 'collected' ? 'Collected — the website recorded it' : 'Shipped by the website' };
    }
    if (row.fulfilledOnWebsite !== false) return { tone: 'neutral', text: 'Packed on the website' };
    return null;
  }
  const reply = row.webShipment;
  if (reply && clean(reply.hash) === shipment.hash) {
    if (reply.result === 'dispatched') return { tone: 'positive', text: 'Website dispatched it — customer emailed' };
    if (reply.result === 'attached') {
      return {
        tone: 'active',
        text: 'Label is on the website order',
        next: 'Mark the parcel shipped here when it goes out, and the website emails the customer.',
      };
    }
    if (reply.result === 'refused') {
      return {
        tone: 'critical',
        text: `Website couldn’t dispatch: ${clean(reply.reason) || 'no reason given'}`,
        next: 'Sort it out in the website’s Orders screen, then dispatch it there. Nothing was changed on the order.',
      };
    }
    if (reply.result === 'checked') return { tone: 'neutral', text: `Rehearsal: ${clean(reply.reason) || 'checked'}` };
  }
  if (sentHash && sentHash === shipment.hash) return { tone: 'active', text: 'Label sent to the website — waiting for its answer' };
  return { tone: 'active', text: 'Label going to the website' };
}

/**
 * Why the server copy can't be marked done yet, or '' when it can. The
 * transaction only marks an order imported once the server's saved rows show
 * the planned copies and carry this exact version of the order.
 */
export function markRefusal(mark = {}, doc = null, books = {}) {
  if (!doc || !doc.web) return 'gone';
  if (clean(doc.web.hash) !== clean(mark.hash)) return 'changed';
  const reply = doc.shipmentReply && typeof doc.shipmentReply === 'object' ? doc.shipmentReply : null;
  if (clean(reply && reply.at) !== clean(mark.replyAt)) return 'changed';
  // A rehearsal order is never recorded, so there are no rows to check: the
  // owner clearing it from the list is enough. A real order can never be
  // cleared this way, and a rehearsal can never be marked as brought in.
  if (doc.web.test === true || mark.test === true) {
    return doc.web.test === true && mark.test === true && !Object.keys(mark.effect || {}).length ? '' : 'test';
  }
  const withRows = webBookIdsWithRows(doc.web);
  const ids = new Set([...withRows, ...Object.keys(mark.effect || {})]);
  const hist = {};
  for (const id of ids) {
    if (!books[id]) return 'book-unavailable';
    hist[id] = Array.isArray(books[id].hist) ? books[id].hist : [];
  }
  if (!sameEffect(webOrderEffect(hist, mark.orderId), mark.effect || {})) return 'not-saved';
  for (const id of withRows) {
    if (!hist[id].some(h => h && h.webOrderId === mark.orderId && clean(h.webHash) === clean(mark.hash))) return 'not-saved';
  }
  if (reply && clean(reply.hash) && withRows.length) {
    const rows = withRows.flatMap(id => hist[id].filter(h => h && h.webOrderId === mark.orderId));
    if (!rows.some(h => h.webShipment && clean(h.webShipment.hash) === clean(reply.hash) && clean(h.webShipment.at) === clean(reply.at))) return 'not-saved';
  }
  return '';
}

/**
 * The publish transaction's decisions, from the SERVER's data.
 *
 *   books        { bookId: { hist, ledger, metadata } } as stored
 *   catalog      the stored catalogue ({ bookId: book })
 *   orderDocs    { orderId: websiteOrders doc data | null }
 *   marks        [{ orderId, hash, effect, decisions, replyAt }] — orders this
 *                device believes are in its saved books
 *   shipments    [{ orderId, linkedPostage }] — orders whose label may need
 *                sending; computed here from the saved rows, never the screen
 *   testShipments[{ orderId, shipment }] — a postage rehearsal, test orders only
 *
 * Returns the feed documents to write, the order updates (dotted field paths,
 * only `imported`, `pending` and `app.*`), which marks were accepted, and
 * which labels were sent (`sent`) or were already there (`current`).
 */
export function planWebsitePublish({
  bookIds = [], books = {}, catalog = {}, orderDocs = {}, marks = [], shipments = [], testShipments = [],
  now = new Date().toISOString(), build = '', device = '',
} = {}) {
  const feeds = [];
  for (const id of [...new Set(bookIds || [])]) {
    const parts = books[id];
    const book = catalog && typeof catalog[id] === 'object' && catalog[id] ? catalog[id] : null;
    if (!parts || !book) continue;
    const meta = parts.metadata && typeof parts.metadata === 'object' ? parts.metadata : {};
    const feed = websiteStockFeed(
      { hist: parts.hist || [], ledger: parts.ledger || [], stock: meta.stock, authorStock: meta.authorStock },
      { ...book, id },
    );
    feeds.push({ bookId: id, doc: { ...feed, bookId: id, at: now, build: clean(build) } });
  }

  const updates = new Map();
  const update = (orderId) => {
    if (!updates.has(orderId)) updates.set(orderId, {});
    return updates.get(orderId);
  };
  const accepted = [];
  const refused = [];
  const sent = [];
  const current = []; // labels the website already has: nothing to write

  for (const mark of marks || []) {
    if (!mark || !clean(mark.orderId)) continue;
    const reason = markRefusal(mark, orderDocs[mark.orderId], books);
    if (reason) { refused.push({ orderId: mark.orderId, reason }); continue; }
    Object.assign(update(mark.orderId), {
      imported: {
        hash: clean(mark.hash),
        at: now,
        device: clean(device),
        effect: { ...(mark.effect || {}) },
        decisions: { ...(mark.decisions || {}) },
      },
      pending: false,
    });
    accepted.push(mark.orderId);
  }

  const already = (doc) => clean(doc && doc.app && doc.app.shipment && doc.app.shipment.hash);
  for (const item of shipments || []) {
    const doc = orderDocs[item && item.orderId];
    if (!doc || !doc.web || doc.web.test === true) continue;
    const ids = webBookIdsWithRows(doc.web);
    if (!ids.length || ids.some(id => !books[id])) continue; // can't see every row of the order
    const rows = ids.flatMap(id => (books[id].hist || []).filter(h => h && h.webOrderId === item.orderId));
    const shipment = appShipmentFor(rows, item.linkedPostage, doc.web);
    if (!shipment) continue;
    if (shipment.hash === already(doc)) { current.push({ orderId: item.orderId, hash: shipment.hash }); continue; }
    Object.assign(update(item.orderId), { 'app.shipment': shipment, 'app.shipmentWaiting': true });
    sent.push({ orderId: item.orderId, hash: shipment.hash });
  }

  for (const item of testShipments || []) {
    const doc = orderDocs[item && item.orderId];
    if (!doc || !doc.web || doc.web.test !== true || !item.shipment) continue;
    const s = item.shipment;
    const shipment = {
      carrier: carrierLabel(s.carrier),
      service: clean(s.service),
      trackingNumber: clean(s.trackingNumber),
      trackingUrl: httpUrl(s.trackingUrl),
      labelCostCAD: Number.isFinite(s.labelCostCAD) ? roundCents(s.labelCostCAD) : null,
      labelSource: LABEL_SOURCES.has(s.labelSource) ? s.labelSource : 'hand',
      boughtAt: s.boughtAt || null,
      shippedAt: s.shippedAt || null,
    };
    if (!shipment.trackingNumber) continue;
    shipment.hash = shipmentHash(shipment);
    if (shipment.hash === already(doc)) continue;
    Object.assign(update(item.orderId), { 'app.shipment': shipment, 'app.shipmentWaiting': true });
    sent.push({ orderId: item.orderId, hash: shipment.hash });
  }

  return {
    feeds,
    orderUpdates: [...updates.entries()].map(([orderId, data]) => ({ orderId, data })),
    accepted,
    refused,
    sent,
    current,
  };
}
