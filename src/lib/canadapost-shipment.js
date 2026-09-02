/**
 * Canada Post Shipping API 8.0.0 — reading what Create Shipment gives back.
 *
 * Split out of canadapost.js because these are pure functions over a response
 * body, and the shipment path is the one place in this app where being wrong
 * costs real money: a mis-read response can mark an order shipped against a
 * label that was never created, or leave a created label untransmitted and earn
 * a surcharge weeks later.
 *
 * See docs/canada-post-shipping-api.md for the standing rules. The short
 * version: paths and workflow are documented and fixed; the exact field names
 * in the request body and response envelope are only in the app's OpenAPI spec,
 * so everything here reads defensively across the shapes Canada Post has used
 * rather than asserting one and throwing on the rest.
 */

/**
 * Envelope names seen for a created shipment.
 *
 * The committed spec (docs/shipping-api-openapi.yaml) returns the shipment
 * FLAT — `shipmentId`, `shipmentStatus`, `trackingPin`, `links` at the top
 * level, no wrapper at all. The wrapper names below are kept for the legacy
 * shapes, because a shipment created before this change and reprinted after it
 * still has to be readable.
 */
const SHIPMENT_ENVELOPES = [
  'shipmentInfo',
  'nonContractShipmentInfo',
  'contractShipmentInfo',
  'shipment'
];

/** Link relations that point at the printable label. */
const LABEL_RELS = ['label', 'artifact', 'shippinglabel'];
const RECEIPT_RELS = ['receipt', 'manifest'];

/** Read a `{'@rel','@href'}` / `{rel,href}` link list in either shape. */
function readLinks(container) {
  const raw = container?.links?.link ?? container?.links ?? container?.link ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter(Boolean)
    .map(link => ({
      rel: String(link['@rel'] ?? link.rel ?? '').toLowerCase(),
      href: String(link['@href'] ?? link.href ?? ''),
      mediaType: String(link['@media-type'] ?? link.mediaType ?? '')
    }))
    .filter(link => link.href);
}

/** The first link whose relation is in `rels`. */
function findLink(links, rels) {
  for (const rel of rels) {
    const hit = links.find(link => link.rel === rel);
    if (hit) return hit;
  }
  return null;
}

/**
 * Pull the artifact identifiers out of an artifact href.
 *
 * Canada Post hands back a full URL, and that URL is what should be fetched.
 * The identifiers are extracted anyway so a reprint months later can rebuild
 * the request from stored fields alone — the href is on a host that may change,
 * the identifiers are the durable part.
 */
export function parseArtifactHref(href) {
  const url = String(href || '');
  if (!url) return null;

  const match = url.match(/\/artifacts\/([^/]+)\/shipping\/([^/]+)(?:\/([^/?#]+))?/i);
  if (!match) return { href: url, consumerId: '', artifactId: '', index: '' };

  return {
    href: url,
    consumerId: decodeURIComponent(match[1] || ''),
    artifactId: decodeURIComponent(match[2] || ''),
    index: decodeURIComponent(match[3] || '0')
  };
}

/**
 * How Canada Post writes the manifest instruction on the label itself.
 *
 * Taken from a real Expedited Parcel label, which prints the ABBREVIATED,
 * bilingual form:
 *
 *     MANIFEST NOT REQ
 *     MANIFESTE NON REQ
 *
 * The first version of this matched only the fully spelled-out English
 * "manifest required", so a label reading "MANIFEST REQ" was read as not
 * required and the parcel would have gone out untransmitted — the exact
 * surcharge this check exists to prevent. Match the abbreviation, both
 * languages, and the negation, or the check is worse than useless: it is
 * reassuring and wrong.
 */
const MANIFEST_PHRASE = /manifeste?\s*(non|not)?\s*(req(?:uired|uis|d)?)\b/gi;

/** 'required' | 'not-required' | 'unknown' — the signal, before it is judged. */
export function manifestSignal(data) {
  if (!data || typeof data !== 'object') return 'unknown';

  const explicit = data.manifestRequired
    ?? data.requiresManifest
    ?? data.shipmentInfo?.manifestRequired
    ?? data.nonContractShipmentInfo?.manifestRequired;

  if (typeof explicit === 'boolean') return explicit ? 'required' : 'not-required';
  if (typeof explicit === 'string') {
    const value = explicit.trim();
    if (/^(true|yes|y|required|requis)$/i.test(value)) return 'required';
    if (/^(false|no|n|not required|non requis)$/i.test(value)) return 'not-required';
  }

  // The spec gives two signals better than any wording on the label.
  //
  // `shipmentStatus` is one of created / transmitted / suspended. A transmitted
  // shipment is already on a manifest, so nothing is owed.
  const status = String(data.shipmentStatus ?? data.shipmentInfo?.shipmentStatus ?? '').toLowerCase();
  if (status === 'transmitted') return 'not-required';

  // A `receipt` link exists only for a shipment where no manifest is required
  // and payment was taken by credit card or supplier account — the spec says so
  // in as many words. Its presence is therefore a positive "nothing is owed".
  const links = readLinks(data.links ? data : (data.shipmentInfo || data.nonContractShipmentInfo || {}));
  if (links.some(link => link.rel === 'receipt')) return 'not-required';

  // Fall back to the wording printed on the label. Polarity decides: an
  // affirmative anywhere wins, because a shipment that needs a manifest needs
  // one whatever else the document says.
  const haystack = JSON.stringify(data);
  let sawNegative = false;
  for (const match of haystack.matchAll(MANIFEST_PHRASE)) {
    if (match[1]) sawNegative = true;
    else return 'required';
  }
  if (sawNegative) return 'not-required';

  return 'unknown';
}

/**
 * Does this shipment still need to be transmitted on a manifest?
 *
 * This is the workflow step most easily skipped, and skipping it is not a
 * cosmetic problem: Canada Post surcharges unmanifested shipments.
 *
 * An unknown signal is treated as REQUIRED. Erring that way is deliberate: a
 * needless manifest costs one extra call, a missed one costs money on every
 * parcel it covered. Only an explicit "not required" — a false field, or the
 * "MANIFEST NOT REQ" the label prints — buys a clean no.
 */
export function manifestRequired(data) {
  if (!data || typeof data !== 'object') return false;
  return manifestSignal(data) !== 'not-required';
}

/**
 * Read a Create Shipment response.
 *
 * Returns a plain result rather than throwing for a Canada Post error, so the
 * caller can classify the code and decide about retries. It throws only for a
 * body that is not a shipment response at all — there is nothing to decide
 * about that.
 */
export function parseShipmentResponse(body) {
  let data = body;
  if (typeof body === 'string') {
    const text = body.trim();
    if (!text) throw new Error('Canada Post returned an empty response, so no label was created.');
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error('Canada Post returned a response that was not shipment data, so no label was created.');
    }
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Canada Post returned no shipment data, so no label was created.');
  }

  const envelopeKey = SHIPMENT_ENVELOPES.find(key => data[key] && typeof data[key] === 'object');
  const info = envelopeKey ? data[envelopeKey] : data;

  const links = readLinks(info);
  const labelLink = findLink(links, LABEL_RELS);
  const receiptLink = findLink(links, RECEIPT_RELS);

  const shipmentId = String(info.shipmentId ?? info.id ?? '');
  const shipmentStatus = String(info.shipmentStatus ?? data.shipmentStatus ?? '');
  const trackingPin = String(info.trackingPin ?? info.trackingNumber ?? info.pin ?? '');

  return {
    shipmentId,
    shipmentStatus,
    trackingPin,
    labelUrl: labelLink?.href || '',
    receiptUrl: receiptLink?.href || '',
    artifact: labelLink ? parseArtifactHref(labelLink.href) : null,
    manifestRequired: manifestRequired(data),
    // The raw three-state signal travels alongside the boolean, so the screen
    // can tell "Canada Post said yes" apart from "Canada Post did not say".
    manifestSignal: manifestSignal(data),
    // A shipment with neither identifier is not a shipment, whatever the status
    // code said. Callers check this before booking anything to the ledger.
    created: !!(shipmentId || trackingPin),
    raw: data
  };
}

/**
 * What the shop owner should do next, in their own words.
 *
 * Three states rather than two. A label that genuinely needs a manifest gets a
 * firm instruction; one where Canada Post's reply did not say either way gets
 * an honest "we could not tell" — because warning identically on every parcel
 * teaches the owner to ignore the warning, which costs exactly as much as not
 * showing it at all on the day it is real.
 */
export function describeNextStep(result) {
  if (!result?.created) {
    return 'No label was created, so nothing was charged and nothing needs printing.';
  }

  const signal = result.manifestSignal
    || (result.manifestRequired ? 'required' : 'not-required');

  if (signal === 'required') {
    return 'This label needs a manifest — a single summary sheet Canada Post wants for these parcels. '
      + 'Send it before you drop the parcel off, or Canada Post adds a surcharge to it.';
  }
  if (signal === 'unknown') {
    return 'Canada Post did not say whether this parcel needs a manifest — the summary sheet that goes with '
      + 'a batch of parcels. Sending one when it is not needed costs nothing, so send it to be safe.';
  }
  return 'Print the label and attach it to the parcel. Nothing else is needed before drop-off.';
}
