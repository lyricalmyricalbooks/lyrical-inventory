// Noticing that an order already has a label before buying it another.
//
// A second label for the same parcel is pure loss: the postage is charged the
// moment it is bought, and nothing downstream objects — the order just gets
// its tracking number overwritten and the ledger gains a second postage line.
// It happens through a double-click, a second device whose copy of the order
// has not synced yet, or simply forgetting the order was already done.
//
// Pure — takes the order history and the expense ledger as inputs, returns
// what it found, and leaves the wording of the warning to the caller.

import { normalizeShippingOrderNumber } from './shipping-reconciliation.js';
import { isPostageExpense, isPostageLinked } from './postage-matching.js';
import { refundState } from './label-refunds.js';

/**
 * Every sign that `orderNumber` already has a label.
 * @returns {{ tracking: string, shippedDate: string, labels: Array<{ desc: string, amount: number, currency: string, date: string }> } | null}
 */
export function findExistingLabel(orderNumber, { hist = [], expenses = [] } = {}) {
  const wanted = normalizeShippingOrderNumber(orderNumber);
  if (!wanted) return null;

  const order = hist.find(h => normalizeShippingOrderNumber(h?.num) === wanted);
  const tracking = String(order?.trackingNumber || '').trim();

  // Test-mode rehearsals are stamped `simulated` and never cost anything.
  const labels = expenses
    // A refunded or refund-requested label no longer ships anything.
    .filter(e => e && !e.simulated && isPostageExpense(e) && isPostageLinked(e)
      && refundState(e, expenses) === 'none'
      && normalizeShippingOrderNumber(e.shippingOrderNumber) === wanted)
    .map(e => ({
      desc: String(e.desc || 'Postage'),
      amount: Number(e.amount) || 0,
      currency: String(e.currency || 'CAD').toUpperCase(),
      date: String(e.date || ''),
    }));

  if (!tracking && labels.length === 0) return null;
  return { tracking, shippedDate: String(order?.shippedDate || ''), labels };
}

/** The rows the "already has a label" confirmation shows. */
export function describeExistingLabel(found) {
  if (!found) return [];
  const rows = [];
  if (found.tracking) rows.push(['Tracking', found.tracking]);
  if (found.shippedDate) rows.push(['Shipped', found.shippedDate]);
  found.labels.slice(0, 3).forEach(l => {
    rows.push(['Label bought', `${l.date ? l.date + ' · ' : ''}${l.amount.toFixed(2)} ${l.currency}`]);
  });
  if (found.labels.length > 3) rows.push(['', `…and ${found.labels.length - 3} more`]);
  return rows;
}
