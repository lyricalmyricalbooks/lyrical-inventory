// Website orders the store refunded or cancelled after they were recorded.
//
// An order recorded in the ledger stayed a sale when the store later refunded
// or cancelled it: its copies stayed "sold" and its money stayed in the
// earnings. The storefront check already reads every order's status; this
// decides which recorded orders the store has since reversed. Pure.

import { bigCartelOrderNumber, sameOrderNumber } from './bigcartel-ledger-gap.js';

const clean = (value) => String(value ?? '').trim().toLowerCase();

/** 'reversed' (cancelled or fully refunded), 'partial', or '' for a live order. */
export function storeReversal(order = {}) {
  const attr = order.attributes || {};
  const status = clean(attr.status);
  const payment = clean(attr.payment_status);
  if (['cancelled', 'canceled', 'voided'].includes(status)) return 'reversed';
  if (status === 'refunded' || payment === 'refunded') return 'reversed';
  if (payment === 'partially_refunded' || payment === 'partially refunded' || status === 'partially_refunded') return 'partial';
  return '';
}

/**
 * The recorded website sales whose store order has since been reversed.
 * `rows` are `{ bookId, entry }` ledger rows. A row already raised
 * (`storeReversalNoted`) or already voided is left alone.
 */
export function storeReversalsToRaise(bcOrders = [], rows = []) {
  const reversed = [];
  (Array.isArray(bcOrders) ? bcOrders : []).forEach(order => {
    const kind = storeReversal(order);
    const num = bigCartelOrderNumber(order);
    if (kind && num) reversed.push({ num, kind });
  });
  if (!reversed.length) return [];
  const out = [];
  (Array.isArray(rows) ? rows : []).forEach(({ bookId, entry }) => {
    if (!entry || entry.voided || entry.chan !== 'Website' || entry.storeReversalNoted || !entry.sheetsId) return;
    const hit = reversed.find(r => sameOrderNumber(r.num, entry.num));
    if (hit) out.push({ bookId, sheetsId: entry.sheetsId || '', num: entry.num, qty: Number(entry.qty) || 0, full: hit.kind === 'reversed' });
  });
  return out;
}
