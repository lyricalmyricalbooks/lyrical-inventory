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
 * The legacy API wrapped it in `nonContractShipmentInfo`; v8's own naming is not
 * published outside the spec. Reading several is not sloppiness — it is the
 * difference between a working integration and a 'label purchased' screen that
 * shows an empty tracking number because one key was renamed.
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
 * Does this shipment still need to be transmitted on a manifest?
 *
 * This is the workflow step most easily skipped, and skipping it is not a
 * cosmetic problem: Canada Post surcharges unmanifested shipments. Canada Post
 * signals it inconsistently — a boolean field on some responses, a phrase on
 * the label or in a message on others — so all of them are checked, and an
 * ambiguous answer is treated as "required".
 *
 * Erring toward "required" is deliberate. A needless manifest costs nothing but
 * an extra call; a missed one costs money on every parcel it covered.
 */
export function manifestRequired(data) {
  if (!data || typeof data !== 'object') return false;

  const explicit = data.manifestRequired
    ?? data.requiresManifest
    ?? data.shipmentInfo?.manifestRequired
    ?? data.nonContractShipmentInfo?.manifestRequired;
  if (typeof explicit === 'boolean') return explicit;
  if (typeof explicit === 'string') return /^(true|yes|y|required)$/i.test(explicit.trim());

  // Fall back to the wording Canada Post prints on the label itself.
  const haystack = JSON.stringify(data);
  return /manifest\s*required/i.test(haystack);
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
  const trackingPin = String(info.trackingPin ?? info.trackingNumber ?? info.pin ?? '');

  return {
    shipmentId,
    trackingPin,
    labelUrl: labelLink?.href || '',
    receiptUrl: receiptLink?.href || '',
    artifact: labelLink ? parseArtifactHref(labelLink.href) : null,
    manifestRequired: manifestRequired(data),
    // A shipment with neither identifier is not a shipment, whatever the status
    // code said. Callers check this before booking anything to the ledger.
    created: !!(shipmentId || trackingPin),
    raw: data
  };
}

/**
 * What the shop owner should do next, in their own words.
 *
 * Returned as a sentence rather than a flag because the manifest step is the
 * one thing they have to act on, and a flag with no explanation reliably gets
 * ignored.
 */
export function describeNextStep(result) {
  if (!result?.created) {
    return 'No label was created, so nothing was charged and nothing needs printing.';
  }
  if (result.manifestRequired) {
    return 'This label needs a manifest — a single summary sheet Canada Post wants for these parcels. '
      + 'Send it before you drop the parcel off, or Canada Post adds a surcharge to it.';
  }
  return 'Print the label and attach it to the parcel. Nothing else is needed before drop-off.';
}
