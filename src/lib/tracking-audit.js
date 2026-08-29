// Checking that the tracking numbers on shipped orders are real.
//
// WHY THIS EXISTS
// A tracking number reaches a customer. It goes in the "your book is on its
// way" email, and it is the one thing they can act on while they wait. So a
// number that does not exist at Canada Post is worse than no number at all:
// the customer checks it, gets nothing, and concludes the parcel was never
// sent. Meanwhile the order reads as shipped in the ledger, so nobody notices.
//
// The app used to be able to produce exactly that. When the Canada Post gateway
// was unreachable it invented a plausible PIN, reported the purchase as done and
// marked the order shipped. That path is gone, but any order marked shipped
// before it was removed may still be carrying an invented number, and there is
// no way to tell by looking at it — a fabricated PIN has the same shape as a
// real one.
//
// So this module decides *which* orders are worth asking Canada Post about and
// how to read the answers. It is deliberately free of network and DOM code so
// the selection rules can be tested directly; shipping.js does the asking.

/**
 * A Canada Post tracking PIN is 11 to 16 digits.
 *
 * The check is loose on purpose. Its job is to keep other carriers' tracking
 * numbers out of a Canada Post lookup — a Shippo/USPS number would simply come
 * back "not found" and read as a false alarm — not to judge whether the number
 * is genuine. That is the question the lookup itself answers.
 */
export function looksLikeCanadaPostPin(pin) {
  const digits = String(pin || '').replace(/\D/g, '');
  return digits.length >= 11 && digits.length <= 16;
}

/** Normalize a PIN for lookup and comparison: digits only. */
export function normalizeTrackingPin(pin) {
  return String(pin || '').replace(/\D/g, '');
}

/**
 * Pick the shipped orders whose tracking number can be checked against Canada Post.
 *
 * An order qualifies when it is marked shipped, carries a tracking number, and
 * that number is either explicitly Canada Post's or shaped like one. Voided
 * orders are skipped — they are not owed a parcel. Duplicates by PIN are
 * collapsed so one parcel is asked about once, however many orders reference it.
 */
export function collectVerifiableShipments(orders) {
  const seen = new Set();
  const out = [];

  (orders || []).forEach(order => {
    if (!order || order.voided || !order.shipped) return;

    const raw = order.trackingNumber || order.trackingPin || '';
    const pin = normalizeTrackingPin(raw);
    if (!pin) return;

    // A shipment the app bought is known to be Canada Post's. Anything else is
    // admitted only if it is shaped like a Canada Post PIN.
    const isCanadaPost = order.carrier === 'canadapost' || looksLikeCanadaPostPin(pin);
    if (!isCanadaPost) return;

    if (seen.has(pin)) return;
    seen.add(pin);

    out.push({
      pin,
      orderNum: order.num || order.orderNum || '',
      shippedDate: order.shippedDate || order.date || '',
      declarationId: order.declarationId || '',
    });
  });

  return out;
}

/**
 * Read one lookup into a verdict.
 *
 * The distinction that matters is between "Canada Post says no such parcel"
 * and "we could not ask". The first is a real problem the publisher must act
 * on; the second is a flat network and means nothing about the parcel. Reporting
 * an unreachable gateway as a missing parcel would send someone chasing a
 * shipment that is fine, so the two never share a bucket.
 */
export function classifyTrackingResult({ result, error } = {}) {
  if (result && result.found) {
    return { status: 'verified', detail: result.status || 'Found at Canada Post' };
  }

  const message = String(error?.message || error || '').trim();
  if (!message) {
    return { status: 'missing', detail: 'Canada Post has no record of this tracking number.' };
  }

  // Canada Post answered, and the answer was "no such PIN".
  if (/no pin history|not found|no record|invalid pin|no tracking record/i.test(message)) {
    return { status: 'missing', detail: 'Canada Post has no record of this tracking number.' };
  }

  // We never got an answer — offline, blocked, or unconfigured.
  return { status: 'unchecked', detail: message };
}

/**
 * Roll individual verdicts into the counts the summary line reports.
 */
export function summarizeTrackingAudit(verdicts) {
  const summary = { total: 0, verified: 0, missing: 0, unchecked: 0 };
  (verdicts || []).forEach(v => {
    summary.total++;
    if (v?.status === 'verified') summary.verified++;
    else if (v?.status === 'missing') summary.missing++;
    else summary.unchecked++;
  });
  return summary;
}

/**
 * The sentence shown above the results.
 *
 * Missing parcels lead, because they are the only part that needs action.
 */
export function describeTrackingAudit(summary) {
  const s = summary || { total: 0, verified: 0, missing: 0, unchecked: 0 };
  if (!s.total) return 'No shipped orders with a Canada Post tracking number to check.';

  const parts = [];
  if (s.missing) {
    parts.push(`${s.missing} tracking number${s.missing === 1 ? '' : 's'} Canada Post has no record of`);
  }
  if (s.verified) {
    parts.push(`${s.verified} confirmed`);
  }
  if (s.unchecked) {
    parts.push(`${s.unchecked} could not be checked`);
  }
  return `Checked ${s.total} shipped order${s.total === 1 ? '' : 's'}: ${parts.join(', ')}.`;
}
