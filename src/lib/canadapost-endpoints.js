/**
 * Canada Post API endpoint registry.
 *
 * Every Canada Post path the app calls is declared here, in one place, so that
 * a path can never again be half-migrated: the rating call was moved to the
 * Developer Portal gateway while the shipment call was left on the retired
 * `/rs/{customer}/ncshipment` shape, pointed at a host that has no such path.
 * That mismatch is invisible when each endpoint is a string built inline at its
 * call site, and it is what stopped a sandbox run from ever reaching a real
 * Canada Post label.
 *
 * Standing rules for this file — see docs/canada-post-shipping-api.md:
 * NEVER invent a path, media type or scope here. Every value must come from the
 * portal's guides or the downloaded OpenAPI spec for the API in question. An
 * unconfigured value is reported as unconfigured; it is never guessed at,
 * because a guessed path fails at the counter, not in the console.
 */

/**
 * Shared namespace for every REST API served by the Developer Portal gateway.
 * The retired Web Services API used bare `/rs/...` paths on `soa-gw` hosts;
 * nothing on this host does.
 *
 * The portal generates this segment per app, so if a call 404s with correct
 * credentials, check the casing of this string against the base URL shown on
 * your own app's page before assuming the path below is wrong.
 */
export const CANADAPOST_API_ROOT = '/prod/devportal-portaildesdeveloppeurs';

/** Rating API 4.0.0 — in production use, confirmed working. */
export const CANADAPOST_RATING_API = {
  pricesPath: `${CANADAPOST_API_ROOT}/rating/v1/prices`,
  servicesPath: `${CANADAPOST_API_ROOT}/rating/v1/services`,
  optionPath: `${CANADAPOST_API_ROOT}/rating/v1/options/{optionCode}`,
  scope: 'merchant',
  product: 'rating'
};

/** Tracking — in production use, confirmed working. */
export const CANADAPOST_TRACKING_API = {
  summaryPath: `${CANADAPOST_API_ROOT}/tracking/v1/pins/{pin}/summaries`,
  scope: 'merchant',
  product: 'tracking'
};

/**
 * Shipping API — creates real shipments and money-bearing labels.
 *
 * Paths and field names below are taken from the Shipping OpenAPI definition
 * committed at docs/shipping-api-openapi.yaml. Note the version: the spec
 * declares `1.0.0` / `shipping-service-v1`, not the 8.0.0 of the older Web
 * Services product. The gateway path carries `/shipping/v1`, and leaving that
 * segment out — as this registry did before the spec arrived — produces a 404
 * that reads like a credentials problem.
 *
 * `{mailedBy}` is the billing customer number. `{mobo}` is "mailed on behalf
 * of"; for a single-merchant shop it is the same number again.
 */
export const CANADAPOST_SHIPPING_ROOT = `${CANADAPOST_API_ROOT}/shipping/v1`;

export const CANADAPOST_SHIPPING_API = {
  createShipmentPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/shipments`,
  getShipmentPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/shipments/{shipmentId}`,
  shipmentPricePath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/shipments/{shipmentId}/price`,
  shipmentDetailsPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/shipments/{shipmentId}/details`,
  shipmentReceiptPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/shipments/{shipmentId}/receipt`,
  qrCodePath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/shipments/{shipmentId}/qr-code`,
  voidShipmentPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/shipments/{shipmentId}`,
  refundShipmentPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/shipments/{shipmentId}/refund`,
  groupsPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/groups`,
  artifactPath: `${CANADAPOST_SHIPPING_ROOT}/artifacts/{consumerId}/shipping/{artifactId}/{index}`,
  scope: 'merchant',
  product: 'shipping'
};

/**
 * Manifest service — the proof-of-payment document for a batch of shipments.
 *
 * This is not optional bookkeeping. A label that says "manifest required" and
 * is never transmitted earns a surcharge for an unmanifested shipment, and the
 * charge lands quietly on the account weeks later. See `manifestRequired` in
 * canadapost-shipment.js for where that is detected.
 */
export const CANADAPOST_MANIFEST_API = {
  transmitPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/manifests`,
  getManifestPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/manifests/{manifestId}`,
  manifestDetailsPath: `${CANADAPOST_SHIPPING_ROOT}/{mailedBy}/{mobo}/manifests/{manifestId}/details`,
  scope: 'merchant',
  product: 'shipping'
};

/**
 * The label document. Format is content-negotiated, and the portal does not
 * publish which formats a given app returns, so this is the requested type and
 * the response's own Content-Type is what the app actually trusts.
 */
export const CANADAPOST_ARTIFACT_MEDIA_TYPE = 'application/pdf';

/** OAuth token exchange. Tokens last 3600s; refresh before that, never per call. */
export const CANADAPOST_TOKEN_PATH = '/oauth2/token';
export const CANADAPOST_TOKEN_TTL_SECONDS = 3600;

/**
 * Substitute `{placeholders}` in a path, URL-encoding each value.
 *
 * Any placeholder left unfilled is a programming error rather than something to
 * paper over: a path containing a literal `{shipmentId}` would be sent to
 * Canada Post as-is and answered with a confusing 404, so this throws instead.
 */
export function fillCanadaPostPath(path, values = {}) {
  const template = String(path || '').trim();
  if (!template) return '';

  const filled = template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key];
    if (value === undefined || value === null || String(value).trim() === '') return match;
    return encodeURIComponent(String(value).trim());
  });

  const unfilled = filled.match(/\{(\w+)\}/g);
  if (unfilled) {
    throw new Error(
      `Canada Post endpoint is missing ${unfilled.join(', ')} — the call was not sent. `
      + 'This is a configuration problem, not a Canada Post outage.'
    );
  }
  return filled;
}

/** Join a gateway base URL and a path without doubling or dropping the slash. */
export function joinCanadaPostUrl(baseUrl, path) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  const tail = String(path || '');
  if (!tail) return root;
  return `${root}${tail.startsWith('/') ? '' : '/'}${tail}`;
}

/**
 * "Mailed on behalf of" defaults to the billing customer.
 *
 * The advanced hierarchy (groups, a distinct mobo) exists for platforms mailing
 * for many merchants. This is one publisher mailing their own books, so mobo is
 * opt-in: configure it only if Canada Post has told you to.
 */
export function resolveMobo({ mailedBy = '', mobo = '' } = {}) {
  const explicit = String(mobo || '').trim();
  return explicit || String(mailedBy || '').trim();
}

/**
 * Build any Shipping or Manifest endpoint.
 *
 * One builder for every call rather than a helper per path, so a new call
 * cannot quietly reintroduce an inline string.
 */
export function buildCanadaPostEndpoint({
  baseUrl = '',
  path = '',
  mailedBy = '',
  mobo = '',
  ...rest
} = {}) {
  const values = {
    ...rest,
    mailedBy: String(mailedBy || '').trim(),
    mobo: resolveMobo({ mailedBy, mobo })
  };
  return joinCanadaPostUrl(baseUrl, fillCanadaPostPath(path, values));
}

/**
 * Create Shipment, the call that actually spends money.
 */
export function resolveShipmentEndpoint({
  baseUrl = '',
  customerNumber = '',
  mobo = '',
  config = CANADAPOST_SHIPPING_API
} = {}) {
  if (!String(customerNumber || '').trim()) return '';
  return buildCanadaPostEndpoint({
    baseUrl,
    path: config.createShipmentPath,
    mailedBy: customerNumber,
    mobo
  });
}

/**
 * The label document for a created shipment.
 *
 * Canada Post returns the artifact as a full href on the shipment response, so
 * that href is preferred whenever present — building the path by hand is the
 * fallback for a reprint days later when only the identifiers were kept.
 */
export function resolveArtifactEndpoint({
  baseUrl = '',
  consumerId = '',
  artifactId = '',
  index = 0,
  config = CANADAPOST_SHIPPING_API
} = {}) {
  if (!String(consumerId || '').trim() || !String(artifactId || '').trim()) return '';
  return buildCanadaPostEndpoint({
    baseUrl,
    path: config.artifactPath,
    consumerId,
    artifactId,
    index: String(index ?? 0)
  });
}

/** Transmit Shipments — turns a batch into a manifest. */
export function resolveManifestEndpoint({
  baseUrl = '',
  customerNumber = '',
  mobo = '',
  config = CANADAPOST_MANIFEST_API
} = {}) {
  if (!String(customerNumber || '').trim()) return '';
  return buildCanadaPostEndpoint({
    baseUrl,
    path: config.transmitPath,
    mailedBy: customerNumber,
    mobo
  });
}

/**
 * The OAuth scope to request for a call. Every API on this app currently mints
 * against the same scope; the per-API field exists so that a future
 * subscription needing its own scope is a one-line change here rather than a
 * hunt through call sites.
 */
export function resolveCanadaPostScope(api) {
  return String(api?.scope || '').trim() || CANADAPOST_RATING_API.scope;
}

/** Which rolling rate-limit bucket a call belongs to. Limits differ per product. */
export function resolveCanadaPostProduct(api) {
  return String(api?.product || '').trim() || 'rating';
}
