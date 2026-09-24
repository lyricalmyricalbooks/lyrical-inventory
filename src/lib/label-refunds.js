// Getting money back for a shipping label that was never used.
//
// A refund touches three records that must agree afterwards: the carrier (who
// holds the money), the postage expense (what the books say was spent) and the
// order (whether the parcel still needs to go out). Skip any one and the app
// lies somewhere — a cancelled label still counted as a cost, or an order that
// reads "shipped" with a dead tracking number while the book sits on the shelf.
//
// Pure — decides states and builds records; the shipping tab does the calls.

import { refundExpense } from './shippo-invoices.js';

/** Which carrier sold this label, or '' when it isn't a label this app can refund. */
export function refundCarrier(expense = {}) {
  const ref = String(expense.ref || '');
  if (ref.startsWith('shippo:')) return 'shippo';
  if (ref.startsWith('canadapost:')) return 'canadapost';
  return '';
}

/**
 * Where a label stands: 'none' (in use), 'requested' (asked for, money not
 * back yet) or 'refunded' (a credit is in the books).
 */
export function refundState(expense = {}, expenses = []) {
  const ref = String(expense.ref || '');
  if (ref && expenses.some(e => e && String(e.refundOf || '') === ref)) return 'refunded';
  if (expense.refundRequest) return 'requested';
  return 'none';
}

/** Whether the "Refund label" button belongs on this expense. */
export function canRequestRefund(expense = {}, expenses = []) {
  if (!refundCarrier(expense) || expense.simulated) return false;
  if (!((Number(expense.amount) || 0) > 0)) return false;
  return refundState(expense, expenses) === 'none';
}

/** The Shippo transaction id behind an expense. */
export function shippoTransactionId(expense = {}) {
  const ref = String(expense.ref || '');
  return ref.startsWith('shippo:') ? ref.slice('shippo:'.length) : '';
}

/**
 * The credit that cancels a refunded label, tied to the same order so the
 * order's postage nets to zero instead of the credit landing in the
 * "unmatched postage" pile.
 */
export function refundCredit(original, { refundId, date, prefix = 'shippo-refund' } = {}, idSeed = Date.now()) {
  const entry = refundExpense({ id: refundId, date }, original, idSeed);
  if (!entry) return null;
  entry.ref = `${prefix}:${refundId}`;
  if (original.shippingOrderNumber) {
    entry.shippingOrderNumber = original.shippingOrderNumber;
    entry.shippingMatchStatus = original.shippingMatchStatus || 'matched';
  }
  return entry;
}

/**
 * Puts an order back in the "to ship" pile after its label is refunded — but
 * only when the tracking number on it belongs to the refunded label, so a
 * replacement label bought in the meantime is left alone.
 */
export function unshipOrderForRefund(order, labelTracking = '') {
  if (!order) return false;
  const onOrder = String(order.trackingNumber || '').replace(/\s+/g, '').toUpperCase();
  const refunded = String(labelTracking || '').replace(/\s+/g, '').toUpperCase();
  if (onOrder && refunded && onOrder !== refunded) return false;
  order.shipped = false;
  delete order.shippedDate;
  order.trackingNumber = '';
  return true;
}

/** Plain-language reason Shippo refused a refund. */
export function describeRefundRefusal(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body || '');
  if (/already.*(used|scanned|transit)|has been used|in transit/i.test(text)) {
    return 'The carrier has already scanned this label, so it can’t be refunded.';
  }
  if (/already.*refund/i.test(text)) return 'A refund was already requested for this label.';
  if (/expired|too old|window/i.test(text)) return 'This label is too old to refund.';
  if (status === 401 || status === 403) return 'Shippo didn’t accept your API key.';
  return `Shippo said no (${status}${text ? `: ${text.slice(0, 160)}` : ''}).`;
}
