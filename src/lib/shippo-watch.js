// Noticing a label that was bought somewhere else.
//
// A label bought inside this app is already done by the time the purchase
// returns: buyShippoLabel writes the expense and reconciles it against the
// order in the same breath. A label bought on Shippo's own website is invisible
// here until somebody goes and fetches it — four clicks into the Tax Centre,
// then two more per label in the reconciliation worklist, and no prompt
// anywhere that there is something to fetch in the first place.
//
// That gap is not cosmetic. The shipping P&L, the carrier scorecard and each
// order's own shipping summary all read TAX_CENTER.businessExpenses, so postage
// that has not been imported is money missing from the books, and postage
// imported but not linked is money with no order behind it.
//
// This module is the decision half of closing that gap: when another check is
// worth making, which rows in the answer are not already in the ledger, and
// what to say about them. Pure — no DOM, no timers, no network — deliberately
// mirroring lib/order-watch.js so "the app checks something on its own" is one
// idea in this codebase rather than two.
//
// The cost insight that makes polling viable at all: Shippo returns
// transactions newest-first, and the ledger's own `shippo:<id>` refs are
// already the authoritative dedupe surface. So a check reads page one and stops
// the moment every row on it is known — one request, in the steady state.

const clean = (value) => String(value ?? '').trim();

/** The ledger ref a Shippo transaction id becomes. The one dedupe key. */
export function shippoExpenseRef(objectId) {
  const id = clean(objectId);
  return id ? `shippo:${id}` : '';
}

/**
 * Transaction statuses worth importing.
 *
 * REFUNDED, ERROR and INVALID are skipped for the same reason the manual sweep
 * skips them: they are not postage that was paid for. A refund of a label that
 * *was* paid for is a different thing entirely — it arrives through the refunds
 * endpoint as its own cancelling entry, and never as an edit to the original.
 */
export function isImportableTransaction(tx) {
  const status = clean(tx?.status).toUpperCase();
  return !!clean(tx?.object_id)
    && status !== 'REFUNDED' && status !== 'ERROR' && status !== 'INVALID';
}

/**
 * The rows on this page that the ledger has never seen.
 *
 * `knownRefs` is every `shippo:` ref already in the ledger — the same set the
 * manual import builds, passed in rather than re-derived so both paths dedupe
 * against exactly one source of truth.
 */
export function newShippoTransactions(transactions = [], knownRefs = []) {
  const known = new Set();
  (Array.isArray(knownRefs) ? knownRefs : []).forEach(ref => {
    const value = clean(ref);
    if (value) known.add(value);
  });

  const fresh = [];
  (Array.isArray(transactions) ? transactions : []).forEach(tx => {
    if (!tx || !isImportableTransaction(tx)) return;
    const ref = shippoExpenseRef(tx.object_id);
    if (!ref || known.has(ref)) return;
    known.add(ref);
    fresh.push(tx);
  });
  return fresh;
}

/**
 * Whether to go and ask Shippo again.
 *
 * The same gate shape as order-watch.js's dueForRefresh, and for the same
 * reasons: each condition is a way the request would be wasted or wrong. The
 * hidden-tab gate matters most on a phone, where a backgrounded browser
 * throttles timers to minutes anyway and the answer would go unread until the
 * app is opened.
 */
export function dueForShippoCheck({
  lastCheckedAt = 0,
  now = Date.now(),
  intervalMs = 0,
  online = true,
  configured = true,
  visible = true,
  busy = false,
} = {}) {
  if (!configured || !online || !visible || busy) return false;
  if (!(intervalMs > 0)) return false;
  const last = Number(lastCheckedAt) || 0;
  return (now - last) >= intervalMs;
}

/**
 * What the summary card says after a check that found something.
 *
 * Written for the publisher, and honest about the split: what was filed and
 * linked on its own, and what is still waiting on them. A count of imports
 * alone would hide the only part that needs a person.
 */
export function describeImportedLabels({ imported = 0, linked = 0, needsReview = 0 } = {}) {
  const count = Math.max(0, Math.floor(Number(imported) || 0));
  if (!count) return { count: 0, title: '', detail: '', needsReview: 0 };

  const labels = `${count} label${count === 1 ? '' : 's'}`;
  const parts = [];
  if (linked > 0) {
    parts.push(count === linked
      ? (count === 1 ? 'matched to its order' : 'all matched to their orders')
      : `${linked} matched to ${linked === 1 ? 'its order' : 'their orders'}`);
  }
  if (needsReview > 0) {
    parts.push(`${needsReview} ${needsReview === 1 ? 'needs' : 'need'} you`);
  }

  return {
    count,
    needsReview: Math.max(0, Math.floor(Number(needsReview) || 0)),
    title: `${labels} imported`,
    detail: parts.length
      ? `Bought outside the app — ${parts.join(', ')}.`
      : 'Bought outside the app and added to your books.',
  };
}
