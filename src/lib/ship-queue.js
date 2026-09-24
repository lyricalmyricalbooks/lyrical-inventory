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
