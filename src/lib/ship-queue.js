/**
 * The shipping queue: which orders in the "Ship to" picker are already sent,
 * and which one to load next once a label is bought.
 *
 * Pure so it can be tested without the Shipping tab's DOM. Order numbers are
 * compared after `normalize`, the same rule the ledger uses, so "#1042" and
 * "1042" are one order.
 */

/**
 * Order numbers the ledger already counts as sent: flagged shipped, or holding
 * a tracking number. A test-run label does not count — its number never scans,
 * so the parcel still has to go out.
 */
export function shippedOrderNumbers(rows = [], normalize = v => String(v || '').trim()) {
  const out = new Set();
  rows.forEach(row => {
    const entry = row?.entry || row;
    if (!entry || entry.voided) return;
    const sent = (entry.shipped || entry.trackingNumber) && !entry.trackingSimulated;
    const num = normalize(entry.num);
    if (sent && num) out.add(num);
  });
  return out;
}

/**
 * Finds a ledger order by number in any book, not just the open one. A label
 * bought for another book's order used to leave that order looking unsent.
 */
export function findOrderInAnyBook(states = {}, orderNumber, normalize = v => String(v || '').trim()) {
  const wanted = normalize(orderNumber);
  if (!wanted) return null;
  for (const [bookId, state] of Object.entries(states || {})) {
    const entry = (state?.hist || []).find(h => h && !h.voided && normalize(h.num) === wanted);
    if (entry) return { bookId, entry };
  }
  return null;
}

/** Picker rows that are real orders (not a store address) and not yet sent. */
export function ordersStillToShip(items = [], shipped = new Set(), normalize = v => String(v || '').trim()) {
  const seen = new Set();
  return items.filter(item => {
    const num = normalize(item?.orderNumber);
    if (!num || shipped.has(num) || seen.has(num)) return false;
    seen.add(num);
    return true;
  });
}

/**
 * The order to load after a label: the first unsent one that isn't the order
 * just labelled. Null when the queue is empty.
 */
export function nextOrderToShip(items = [], shipped = new Set(), justShipped = '', normalize = v => String(v || '').trim()) {
  const skip = normalize(justShipped);
  return ordersStillToShip(items, shipped, normalize).find(item => normalize(item.orderNumber) !== skip) || null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const lower = value => String(value ?? '').trim().toLowerCase();

/**
 * True when the storefront itself says the parcel went out. Big Cartel marks
 * an order shipped when it's fulfilled there, including orders labelled
 * outside this app.
 */
export function storefrontSaysShipped(order = {}) {
  const attr = order.attributes || {};
  if (lower(attr.shipping_status) === 'shipped' || lower(attr.status) === 'shipped' || attr.shipped_at) return true;
  // A shipment recorded on the order ("Mark as shipped" with a tracking number).
  const inline = Array.isArray(attr.shipments) ? attr.shipments : [];
  const refs = order.relationships?.shipments?.data;
  return inline.length > 0 || (Array.isArray(refs) ? refs.length > 0 : Boolean(refs));
}

/**
 * Big Cartel orders still waiting for a parcel, oldest first.
 *
 * Left out: cancelled or refunded orders (`reversed`), ones the storefront or
 * the ledger already calls shipped, pick-ups, and anything older than
 * `withinDays` — an order that old went out some other way.
 */
export function bigCartelShipQueue(orders = [], {
  shipped = new Set(),
  pickups = new Set(),
  hidden = new Set(),
  orderNumber = order => order?.id,
  reversed = () => false,
  normalize = v => String(v || '').trim(),
  now = Date.now(),
  withinDays = 60,
} = {}) {
  const seen = new Set();
  const queue = [];
  (Array.isArray(orders) ? orders : []).forEach(order => {
    const num = normalize(orderNumber(order));
    if (!num || seen.has(num)) return;
    seen.add(num);
    const attr = order.attributes || {};
    if (['abandoned', 'pending'].includes(lower(attr.status))) return;
    if (reversed(order) || storefrontSaysShipped(order)) return;
    if (shipped.has(num) || pickups.has(num) || hidden.has(num)) return;
    const placed = Date.parse(attr.created_at || attr.completed_at || '');
    const daysWaiting = Number.isFinite(placed) ? Math.max(0, Math.floor((now - placed) / DAY_MS)) : null;
    if (daysWaiting !== null && daysWaiting > withinDays) return;
    queue.push({ order, orderNumber: num, placedAt: Number.isFinite(placed) ? placed : null, daysWaiting });
  });
  return queue.sort((a, b) => (a.placedAt ?? Infinity) - (b.placedAt ?? Infinity));
}

/** "today", "1 day", "5 days" — how long an order has waited. */
export function waitingPhrase(days) {
  if (days === null || days === undefined) return '';
  if (days <= 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Whether the whole "Ready to ship" card stays closed. It was closed while a
 * given set of orders was waiting; it stays closed until an order that wasn't
 * in that set turns up, so a new sale is never hidden by an old dismissal.
 * `closedFor` null means it was never closed.
 */
export function queueCardClosed(waitingNums = [], closedFor = null) {
  if (!Array.isArray(closedFor)) return false;
  const seen = new Set(closedFor);
  return waitingNums.every(num => seen.has(num));
}
