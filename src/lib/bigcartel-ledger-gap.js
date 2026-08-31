// Catching website orders that never reached the ledger.
//
// WHY THIS EXISTS
// A website sale reaches this app exactly one way: the Gmail scan. fetchOrders()
// asks Apps Script for Big Cartel confirmation emails inside a `daysBack`
// window, and applyOne() writes what it finds into the book's history. Every
// step of that chain is lossy in a way nobody sees. The email can be filtered
// into another label, deleted, or simply older than the window. When it is, the
// sale does not exist anywhere in the app — no history row, no stock
// deduction, no destination in the shipping portal, nothing for a paid label to
// link to.
//
// Meanwhile the storefront itself has known about the order the whole time. The
// Big Cartel API is already connected and already pulls the full order list,
// with the real order number, the customer, the items and the totals. Until now
// the app only *displayed* that list: syncBigCartelShippingPaid() walked every
// storefront order looking for a matching ledger row, found none for the missing
// ones, and said nothing at all. The evidence was in hand and thrown away.
//
// This module is the comparison that was missing. It reads the storefront's
// orders, works out which ones the ledger has never heard of, and describes them
// well enough that the publisher can add each one with a single click. It also
// finds the damage the old workaround caused — see findRecoveredOrderConflicts.
//
// Pure by design: no DOM, no Firestore, no network, no app state. The rules are
// testable on their own, and the ledger mutation stays in main.js with the rest
// of the ledger.

import { normalizeShippingOrderNumber } from './shipping-reconciliation.js';

const clean = (value) => String(value ?? '').trim();
const normalizeText = (value) => clean(value).toLowerCase().replace(/\s+/g, ' ');
const normalizePostal = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * The storefront's order number, normalized to the `#LETTERS-DIGITS` form the
 * rest of the app uses.
 *
 * Big Cartel's JSON:API puts the human order number in `id` — `JMIQ-538069`,
 * not a row number — so that is the first thing tried. `number` and
 * `order_number` are read as fallbacks for stores whose API shape differs.
 *
 * Returns '' when nothing resolves, and **every caller must treat '' as "no
 * number", never as a value to compare**. That is not a stylistic point: it is
 * the bug this function was written to close. normalizeShippingOrderNumber()
 * returns '' for any string without a hyphen, so comparing two unresolved
 * numbers with === made them equal, and a storefront order the app could not
 * identify would match a ledger row the app could not identify.
 */
export function bigCartelOrderNumber(order = {}) {
  const attr = order.attributes || {};
  const candidates = [order.id, attr.number, attr.order_number, order.order_number];
  for (const candidate of candidates) {
    const normalized = normalizeShippingOrderNumber(candidate);
    if (normalized) return normalized;
  }
  return '';
}

/** True when both numbers resolved and they are the same order. */
export function sameOrderNumber(a, b) {
  const left = normalizeShippingOrderNumber(a);
  const right = normalizeShippingOrderNumber(b);
  return !!left && !!right && left === right;
}

/** The order's date as `YYYY-MM-DD`, or '' when the storefront sent nothing usable. */
export function bigCartelOrderDate(order = {}) {
  const attr = order.attributes || {};
  const raw = attr.created_at || attr.placed_at || attr.date || '';
  if (!raw) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().split('T')[0];
}

/** Money the customer paid for the books themselves, with tax and postage taken off. */
export function bigCartelMerchandiseTotal(order = {}) {
  const attr = order.attributes || {};
  const total = Number.parseFloat(attr.total || 0) || 0;
  const tax = Number.parseFloat(attr.tax_total || 0) || 0;
  const shipping = Number.parseFloat(attr.shipping_total || 0) || 0;
  return Math.max(0, total - tax - shipping);
}

function catalogList(books) {
  return Object.values(books || {}).filter(book => book && book.id);
}

/**
 * Which catalog book a storefront product name refers to, or '' when none.
 *
 * Matching is containment in both directions: a storefront product called
 * "Altrove (signed paperback)" should find the book "Altrove", and a product
 * called simply "Altrove" should still find it when the catalog title carries a
 * subtitle. Short titles are excluded from the reverse direction so a two-letter
 * book cannot swallow every product on the store.
 */
export function resolveBookIdByTitle(name, books) {
  const needle = normalizeText(name);
  if (!needle) return '';
  const candidates = catalogList(books)
    .map(book => ({ id: book.id, title: normalizeText(book.title) }))
    .filter(entry => entry.title);
  // Longest title first, so "The Hound of Heaven" wins over "The Hound".
  candidates.sort((a, b) => b.title.length - a.title.length);
  const exact = candidates.find(entry => entry.title === needle);
  if (exact) return exact.id;
  const contained = candidates.find(entry => needle.includes(entry.title));
  if (contained) return contained.id;
  const reverse = candidates.find(entry => entry.title.length >= 4 && entry.title.includes(needle));
  return reverse ? reverse.id : '';
}

function itemName(item) {
  const attr = (item && item.attributes) || item || {};
  return attr.product_name
    || attr.item_option_name
    || attr.option_name
    || attr.product_title
    || (attr.product && (attr.product.name || attr.product.title))
    || attr.name
    || attr.title
    || attr.description
    || '';
}

function itemQty(item) {
  const attr = (item && item.attributes) || item || {};
  const qty = Number.parseInt(attr.quantity ?? attr.qty ?? 1, 10);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function itemUnitPrice(item) {
  const attr = (item && item.attributes) || item || {};
  const raw = attr.price ?? attr.unit_price ?? attr.amount ?? null;
  const price = Number.parseFloat(raw);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

/**
 * The order's line items, as data rather than the HTML string
 * extractBigCartelOrderItems() produces for the orders table.
 *
 * Same four-tier resolution ladder as that function, because the storefront
 * genuinely returns all four shapes depending on the store's plan and the
 * `include` list the request survived:
 *   1. items embedded directly on the order,
 *   2. JSON:API `included` reached through the order's relationships,
 *   3. JSON:API `included` that points back at this order id,
 *   4. nothing itemized at all — deduce the quantity from what was paid.
 *
 * `confidence` is the honest part. 'exact' means a product name matched a
 * catalog title. 'price' means tier 4 divided the merchandise total by a list
 * price and got a whole number — a guess that is usually right and occasionally
 * picks the wrong book of two priced the same, so the review queue shows it as
 * a guess to check rather than adding it silently. 'none' means the line could
 * not be tied to the catalog at all and the publisher must choose the book.
 */
export function bigCartelOrderLines(order = {}, included = [], books = {}) {
  const attr = order.attributes || order;
  const lines = [];

  const pushItem = (item) => {
    const name = itemName(item);
    if (!name) return false;
    const bookId = resolveBookIdByTitle(name, books);
    lines.push({
      title: clean(name),
      bookId,
      qty: itemQty(item),
      unitPrice: itemUnitPrice(item),
      confidence: bookId ? 'exact' : 'none',
    });
    return true;
  };

  // 1. Items embedded on the order itself.
  const rawItems = attr.line_items || attr.items || attr.order_items || attr.order_lines || attr.cart || attr.products;
  if (Array.isArray(rawItems) && rawItems.length) {
    rawItems.forEach(pushItem);
    if (lines.length) return lines;
  }

  const list = Array.isArray(included) ? included : [];

  // 2. Relationship references resolved against `included`.
  const relItems = order.relationships?.items?.data
    || order.relationships?.line_items?.data
    || order.relationships?.order_items?.data
    || order.relationships?.products?.data
    || [];
  if (Array.isArray(relItems) && relItems.length && list.length) {
    relItems.forEach(ref => {
      const match = list.find(inc => inc && String(inc.id) === String(ref.id)
        && (!ref.type || !inc.type || String(inc.type) === String(ref.type)));
      if (match) pushItem(match);
    });
    if (lines.length) return lines;
  }

  // 3. Included resources that name this order.
  if (list.length) {
    list.forEach(inc => {
      if (!inc) return;
      const orderRef = inc.relationships?.order?.data?.id || inc.attributes?.order_id || inc.order_id;
      if (String(orderRef) === String(order.id)) pushItem(inc);
    });
    if (lines.length) return lines;
  }

  // 4. Nothing itemized. Divide what was paid for merchandise by each list
  //    price and keep the first that lands on a whole number of copies.
  const merch = bigCartelMerchandiseTotal(order);
  if (merch > 0) {
    for (const book of catalogList(books)) {
      const price = Number.parseFloat(book.listPrice);
      if (!(price > 0)) continue;
      const ratio = merch / price;
      const qty = Math.round(ratio);
      if (qty > 0 && Math.abs(ratio - qty) < 0.05) {
        lines.push({ title: clean(book.title), bookId: book.id, qty, unitPrice: price, confidence: 'price' });
        return lines;
      }
    }
  }

  return lines;
}

/**
 * A storefront order is not owed a ledger row when the store itself says the
 * sale did not happen. Refunded orders are deliberately NOT in this list: a
 * refund is a sale that occurred and was later reversed, and the ledger's own
 * void flow is the right way to record that — silently skipping it would leave
 * the stock deduction missing.
 */
function isCancelledOrder(order = {}) {
  const status = normalizeText(order.attributes?.status);
  return status === 'cancelled' || status === 'canceled' || status === 'voided' || status === 'abandoned';
}

/**
 * Compare the storefront's orders against everything the ledger knows.
 *
 * `ledgerNumbers` is every order number already accounted for, from any source:
 * applied history rows across all books, the not-yet-applied Gmail queue, and
 * the scan memory's applied list. Anything of the storefront's that is not in
 * there has never been recorded, and its stock was never deducted.
 *
 * `dismissedNums` are storefront orders the publisher has explicitly said are
 * not sales to record (a test order, a comp copy handled elsewhere). They stay
 * out of the queue without pretending they are in the ledger.
 */
export function findLedgerGaps(bcOrders = [], included = [], {
  ledgerNumbers = [],
  books = {},
  dismissedNums = [],
} = {}) {
  const known = new Set();
  ledgerNumbers.forEach(value => {
    const normalized = normalizeShippingOrderNumber(value);
    if (normalized) known.add(normalized);
  });
  const dismissed = new Set();
  dismissedNums.forEach(value => {
    const normalized = normalizeShippingOrderNumber(value);
    if (normalized) dismissed.add(normalized);
  });

  const missing = [];
  let present = 0;
  let cancelled = 0;
  let skipped = 0;
  let unidentified = 0;

  (bcOrders || []).forEach(order => {
    if (!order) return;
    const num = bigCartelOrderNumber(order);
    // No resolvable number means nothing downstream could ever link to it, and
    // guessing one is how the #RECOV- mess started. Count it and move on.
    if (!num) { unidentified++; return; }
    if (known.has(num)) { present++; return; }
    if (isCancelledOrder(order)) { cancelled++; return; }
    if (dismissed.has(num)) { skipped++; return; }

    const attr = order.attributes || {};
    const lines = bigCartelOrderLines(order, included, books);
    const merch = bigCartelMerchandiseTotal(order);
    const qty = lines.reduce((sum, line) => sum + line.qty, 0) || 1;
    const primary = lines.find(line => line.bookId) || lines[0] || null;
    const unitPrice = primary && primary.unitPrice != null
      ? primary.unitPrice
      : (qty > 0 ? Math.round((merch / qty) * 100) / 100 : 0);

    missing.push({
      num,
      orderId: String(order.id ?? ''),
      date: bigCartelOrderDate(order),
      status: clean(attr.status),
      customer: clean(attr.customer_name || attr.buyer_name || attr.shipping_name || ''),
      email: clean(attr.buyer_email || attr.customer_email || attr.email || attr.shipping_email || ''),
      lines,
      bookId: primary?.bookId || '',
      confidence: primary?.confidence || 'none',
      qty,
      unitPrice,
      merchandiseTotal: merch,
      shippingPaid: Number.parseFloat(attr.shipping_total || 0) || 0,
      taxPaid: Number.parseFloat(attr.tax_total || 0) || 0,
      totalPaid: Number.parseFloat(attr.total || 0) || 0,
    });
  });

  return { missing, present, cancelled, skipped, unidentified, checked: (bcOrders || []).length };
}

/**
 * The ledger entry for a storefront order added from the review queue.
 *
 * Deliberately the same shape and the same values applyOne() writes for a
 * scanned order (src/main.js) — same channel, same `notes: 'Big Cartel'`, and
 * critically the same deterministic `sheetsId` derived from the real order
 * number. That identity is the entire point of this feature. The old recovery
 * path invented a `#RECOV-` number, which gave one sale two identities: the
 * storefront's shipping sync could never find it, its Sheets row was a
 * different row, and a later Gmail scan that turned up the real email would
 * apply the same sale a second time. An order added here is indistinguishable
 * downstream from a scanned one, so none of that can happen.
 *
 * `shipPhone` and `sourcedFromBigCartel` are the only additions: the first
 * because the storefront supplies it and the shipping portal wants it, the
 * second so this row's provenance is readable later.
 */
export function buildBigCartelOrderEntry(gap = {}, {
  bookId: _bookId,
  qty: qtyOverride,
  price: priceOverride,
  stockAfter = 0,
  address = {},
  notes = 'Big Cartel',
} = {}) {
  const qty = Math.max(1, Math.floor(Number(qtyOverride ?? gap.qty) || 1));
  const priceValue = Number(priceOverride ?? gap.unitPrice);
  const price = Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : 0;
  const num = normalizeShippingOrderNumber(gap.num) || clean(gap.num);
  const shippingPaid = Number(gap.shippingPaid) || 0;

  return {
    num,
    chan: 'Website',
    qty,
    price,
    after: stockAfter,
    notes: clean(notes) || 'Big Cartel',
    date: clean(gap.date),
    shipName: clean(address.name || gap.customer),
    shipEmail: clean(address.email || gap.email),
    shipAddr1: clean(address.street1),
    shipAddr2: clean(address.street2),
    shipCity: clean(address.city),
    shipProvince: clean(address.state),
    shipPostal: clean(address.zip),
    shipCountry: clean(address.country) || 'Canada',
    shipPhone: clean(address.phone),
    shippingPaid,
    subtotal: Number(gap.merchandiseTotal) || price * qty,
    discountCode: '',
    discountAmount: 0,
    merchandisePaid: Number(gap.merchandiseTotal) || price * qty,
    shippingMethod: '',
    taxPaid: Number(gap.taxPaid) || 0,
    totalPaid: Number(gap.totalPaid) || (price * qty + shippingPaid),
    discountSource: '',
    sourcedFromBigCartel: true,
    // The same deterministic id applyOne() derives, so the same order added on
    // a second device produces one Sheets row rather than two.
    sheetsId: 'bc-' + num.replace(/^#/, '').replace(/[^A-Za-z0-9-]/g, ''),
  };
}

const RECOVERED_NUMBER = /^#?RECOV-/i;

/** A ledger row that stands in for a real storefront order rather than being one. */
export function isPlaceholderEntry(entry = {}) {
  return !!entry.recoveredFromPostage || RECOVERED_NUMBER.test(clean(entry.num));
}

function withinDays(leftDate, rightDate, maxDays) {
  const left = Date.parse(`${leftDate || ''}T00:00:00Z`);
  const right = Date.parse(`${rightDate || ''}T00:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= maxDays * 86400000;
}

/**
 * Find the damage the old recovery path left behind.
 *
 * Before the storefront was consulted, the only way to record a missed order
 * was the shipping worklist's "Add missing order", which numbered the row
 * `#RECOV-XXXXXX` from the Shippo label id. Those rows are real sales with the
 * wrong name on them, and each one is a live double-count risk.
 *
 * Two verdicts come back:
 *   `renumber` — a placeholder row that plainly is a real storefront order.
 *                Rewriting its number and sheetsId makes one sale one sale.
 *   `duplicate` — a placeholder row AND a properly numbered row for the same
 *                 sale already exist. Stock was deducted twice; one must go.
 *
 * Matching is deliberately strict. Renumbering the wrong order would corrupt
 * two records instead of fixing one, so a match needs the customer's email, or
 * the name together with the postal code, inside a two-week window. A near-miss
 * is left alone rather than guessed at.
 */
export function findRecoveredOrderConflicts(bcOrders = [], ledgerEntries = [], { windowDays = 14 } = {}) {
  const entries = (ledgerEntries || []).filter(entry => entry && !entry.voided);
  const placeholders = entries.filter(isPlaceholderEntry);
  const numbered = new Map();
  entries.forEach(entry => {
    const num = normalizeShippingOrderNumber(entry.num);
    if (num && !isPlaceholderEntry(entry)) numbered.set(num, entry);
  });

  const renumber = [];
  const duplicate = [];
  const claimed = new Set();

  placeholders.forEach(entry => {
    const entryEmail = normalizeText(entry.shipEmail);
    const entryName = normalizeText(entry.shipName || entry.customer);
    const entryPostal = normalizePostal(entry.shipPostal);

    const match = (bcOrders || []).find(order => {
      const num = bigCartelOrderNumber(order);
      if (!num || claimed.has(num)) return false;
      const attr = order.attributes || {};
      const orderEmail = normalizeText(attr.buyer_email || attr.customer_email || attr.email || attr.shipping_email);
      const orderName = normalizeText(attr.customer_name || attr.buyer_name || attr.shipping_name);
      const orderPostal = normalizePostal(attr.shipping_zip || attr.zip || attr.postal_code);
      if (!withinDays(entry.date, bigCartelOrderDate(order), windowDays)) return false;
      if (entryEmail && orderEmail) return entryEmail === orderEmail;
      if (entryName && orderName && entryPostal && orderPostal) {
        return entryName === orderName && entryPostal === orderPostal;
      }
      return false;
    });

    if (!match) return;
    const realNum = bigCartelOrderNumber(match);
    claimed.add(realNum);
    const conflict = {
      placeholderNum: clean(entry.num),
      realNum,
      customer: clean(entry.shipName || entry.customer),
      date: clean(entry.date),
      qty: Number(entry.qty) || 0,
      orderId: String(match.id ?? ''),
    };
    if (numbered.has(realNum)) duplicate.push(conflict);
    else renumber.push(conflict);
  });

  return { renumber, duplicate };
}

/**
 * The sentence shown above the review queue.
 *
 * Missing orders lead, because they are the only part that needs action —
 * the same ordering describeTrackingAudit() uses for missing parcels.
 */
export function describeGapSummary(result) {
  const r = result || {};
  const missing = (r.missing || []).length;
  const checked = Number(r.checked) || 0;
  if (!checked) return 'No storefront orders to check yet. Connect Big Cartel and refresh.';

  const parts = [];
  if (missing) {
    parts.push(`${missing} order${missing === 1 ? '' : 's'} missing from your ledger`);
  } else {
    parts.push('every order is in your ledger');
  }
  if (r.cancelled) parts.push(`${r.cancelled} cancelled`);
  if (r.skipped) parts.push(`${r.skipped} set aside`);
  if (r.unidentified) parts.push(`${r.unidentified} with no readable order number`);
  return `Checked ${checked} Big Cartel order${checked === 1 ? '' : 's'}: ${parts.join(', ')}.`;
}
