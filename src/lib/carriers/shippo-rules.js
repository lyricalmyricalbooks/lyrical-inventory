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
