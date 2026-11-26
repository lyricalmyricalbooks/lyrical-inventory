// Shippo's own integration rules, kept in one place so every caller follows them.
//
// - Parcel sizes and weights go to Shippo as strings ("10", never 10). Shippo
//   documents them as strings; numbers are accepted today only by leniency.
// - A rate is a quote for one exact shipment: the addresses, parcel and customs
//   it was asked for. Buying it after the form has changed buys a label for the
//   old details, so a Buy button belongs to the form as it was when quoted.
// - Shippo rates expire after 7 days. Past that a fresh quote is needed.

export const SHIPPO_RATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const PARCEL_NUMBER_FIELDS = ['length', 'width', 'height', 'weight'];

/** A number as Shippo wants it: a plain decimal string, no float noise. */
function toShippoNumberString(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return String(parseFloat(n.toFixed(4)));
}

/** A copy of `parcel` with its sizes and weight as strings. Units and any other field pass through. */
export function toShippoParcel(parcel) {
  const out = { ...parcel };
  for (const key of PARCEL_NUMBER_FIELDS) {
    if (key in out) out[key] = toShippoNumberString(out[key]);
  }
  return out;
}

/**
 * Why a shown Shippo rate can no longer be bought, or null when it still can.
 * 'missing'  — no quote is on screen (or it was cleared).
 * 'changed'  — the form no longer matches what was quoted.
 * 'expired'  — the quote is older than Shippo keeps rates.
 */
export function shippoQuoteProblem(quote, { fingerprint, now = Date.now() } = {}) {
  if (!quote || !quote.fingerprint) return 'missing';
  if (quote.fingerprint !== fingerprint) return 'changed';
  const age = now - Number(quote.at);
  if (!(age >= 0 && age < SHIPPO_RATE_MAX_AGE_MS)) return 'expired';
  return null;
}

/**
 * Shippo's carrier token for a rate's provider name: "Canada Post" →
 * "canada_post", "DHL Express" → "dhl_express", "USPS" → "usps". Tracking asks
 * by token. Empty for an empty name.
 */
export function shippoCarrierToken(provider) {
  return String(provider ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const SHIPPO_PICKUP_SUBSTATUS = new Set(['delivery_attempted', 'notice_left', 'pickup_available', 'package_held']);
const SHIPPO_RETURN_SUBSTATUS = new Set(['return_to_sender', 'package_returned', 'package_undeliverable']);

/**
 * One Shippo tracking answer (GET /tracks/{carrier}/{number}) in the shape the
 * delivery watch reads: { found, status, eventDateTime, eventLocation,
 * actualDeliveryDate, state }. `state` is set only where Shippo says so
 * outright, so the watch's own "not moving for a week" rule still applies to
 * everything else. Returns { found: false } when Shippo knows nothing yet.
 */
export function readShippoTrack(track) {
  const ts = track?.tracking_status;
  const status = String(ts?.status || '').toUpperCase();
  if (!ts || !status || status === 'UNKNOWN') return { found: false };
  const loc = ts.location || {};
  const place = [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
  const when = String(ts.status_date || '');
  const sub = String(ts.substatus?.code || '').toLowerCase();
  let state = '';
  if (status === 'DELIVERED') state = 'delivered';
  else if (status === 'RETURNED' || SHIPPO_RETURN_SUBSTATUS.has(sub)) state = 'returning';
  else if (SHIPPO_PICKUP_SUBSTATUS.has(sub)) state = 'pickup';
  return {
    found: true,
    status: String(ts.status_details || status).trim(),
    eventDateTime: when,
    eventLocation: place,
    actualDeliveryDate: state === 'delivered' ? when.slice(0, 10) : '',
    state,
  };
}

/**
 * Shippo's shipment `extra` block for the label options the publisher picked,
 * or null when none are on. Shippo's field names: `signature_confirmation`,
 * `insurance` ({ amount, currency, content } with the amount as a string), and
 * `is_return` (Shippo swaps the addresses, so the label carries the parcel
 * from the customer back to the shop).
 */
export function shippoLabelExtras({ signature = false, insureAmount = 0, currency = 'CAD', content = 'Printed books', isReturn = false } = {}) {
  const extra = {};
  if (signature) extra.signature_confirmation = 'STANDARD';
  const insured = Number(insureAmount);
  if (Number.isFinite(insured) && insured > 0) {
    extra.insurance = { amount: insured.toFixed(2), currency: String(currency || 'CAD').toUpperCase(), content: String(content || 'Printed books').slice(0, 100) };
  }
  if (isReturn) extra.is_return = true;
  return Object.keys(extra).length ? extra : null;
}
