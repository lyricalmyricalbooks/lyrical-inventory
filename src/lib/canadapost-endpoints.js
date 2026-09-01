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
 * Standing rules for this file — see docs/canada-post-rating-api.md:
 * NEVER invent a path, media type or scope here. Every value must come from the
 * portal's Authentication guide or the downloaded OpenAPI spec for the API in
 * question. An unconfigured endpoint is reported as unconfigured; it is never
 * guessed at, because a guessed path fails at the counter, not in the console.
 */

/**
 * Shared namespace for every REST API served by the Developer Portal gateway.
 * The retired Web Services API used bare `/rs/...` paths on `soa-gw` hosts;
 * nothing on this host does.
 */
export const CANADAPOST_API_ROOT = '/prod/devportal-portaildesdeveloppeurs';

/** Rating API 4.0.0 — in production use, confirmed working. */
export const CANADAPOST_RATING_API = {
  pricesPath: `${CANADAPOST_API_ROOT}/rating/v1/prices`,
  scope: 'merchant'
};

/** Tracking — in production use, confirmed working. */
export const CANADAPOST_TRACKING_API = {
  summaryPath: `${CANADAPOST_API_ROOT}/tracking/v1/pins/{pin}/summaries`,
  scope: 'merchant'
};

/**
 * Shipping API — Create Shipment, then Get Artifact for the label document.
 *
 * This is a SEPARATE API subscription from Rating; a Rating-only app cannot
 * create labels no matter how the call is shaped. These three values are the
 * only things standing between this app and a genuine Canada Post label PDF,
 * and all three must be read off the Shipping API's OpenAPI spec (Developer
 * Portal → APIs → Shipping → download the OpenAPI definition):
 *
 *   createShipmentPath — the POST path for Create Shipment. If it embeds the
 *                        customer number, write it as `{customerNumber}` and it
 *                        will be substituted (URL-encoded) at call time.
 *   scope              — the OAuth scope the Shipping API's tokens are minted
 *                        with. Sent to the proxies, which pass it to the token
 *                        exchange. If Shipping shares Rating's scope, use
 *                        'merchant'.
 *   mediaType          — the versioned JSON media type, if the spec requires one
 *                        (something of the `application/vnd.cpc.*+json` family)
 *                        rather than plain `application/json`. Documented here
 *                        for whoever fills this in: honouring it also needs a
 *                        matching change in the two proxies, which currently
 *                        send plain `application/json` to this host. Leave it
 *                        empty when the spec says plain JSON, as Rating does.
 *
 * Until createShipmentPath is set, label creation reports itself as
 * unconfigured rather than calling a path that does not exist.
 */
const SHIPPING_API_DEFAULTS = Object.freeze({
  createShipmentPath: '',
  scope: '',
  mediaType: ''
});

let shippingApiConfig = { ...SHIPPING_API_DEFAULTS };

/**
 * The Shipping API settings currently in force.
 * Read through this rather than capturing the object once, so that configuring
 * the API takes effect for callers that were loaded earlier.
 */
export function getCanadaPostShippingApi() {
  return { ...shippingApiConfig };
}

/**
 * Switch on Canada Post label creation by supplying the values from the spec.
 *
 * Pass `null` to return to the unconfigured state. Only the keys given are
 * changed, so the scope can be corrected without restating the path.
 */
export function configureCanadaPostShippingApi(config) {
  if (config === null) {
    shippingApiConfig = { ...SHIPPING_API_DEFAULTS };
    return getCanadaPostShippingApi();
  }
  shippingApiConfig = {
    ...shippingApiConfig,
    ...Object.fromEntries(
      Object.entries(config || {}).filter(([key]) => key in SHIPPING_API_DEFAULTS)
    )
  };
  return getCanadaPostShippingApi();
}

/** The label artifact itself is fetched from the href Canada Post returns. */
export const CANADAPOST_ARTIFACT_MEDIA_TYPE = 'application/pdf';

/**
 * True when the Shipping API has been given a real path to call.
 * Everything downstream keys off this rather than off a try/catch, so an
 * unconfigured integration is a stated condition and not a network error.
 */
export function isShippingApiConfigured(config = getCanadaPostShippingApi()) {
  return !!String(config?.createShipmentPath || '').trim();
}

/**
 * Plain-language explanation of what is missing, shown to the shop owner rather
 * than logged. It names the one action that fixes it.
 */
export const SHIPPING_API_UNCONFIGURED_MESSAGE =
  'Canada Post label creation is not switched on yet. Buying a real label needs the Shipping API '
  + 'from your Canada Post developer account, which is separate from the rates service this app already uses. '
  + 'Rates, tracking and test runs all keep working in the meantime.';

/**
 * Build the Create Shipment endpoint for a customer.
 * Returns '' when the Shipping API has not been configured, so callers must
 * decide what to do about that explicitly instead of posting to a bad path.
 */
export function resolveShipmentEndpoint({
  baseUrl = '',
  customerNumber = '',
  config = getCanadaPostShippingApi()
} = {}) {
  if (!isShippingApiConfigured(config)) return '';

  const path = String(config.createShipmentPath || '').trim();
  const withCustomer = path.replace(
    /\{customerNumber\}/g,
    encodeURIComponent(String(customerNumber || '').trim())
  );
  const root = String(baseUrl || '').replace(/\/+$/, '');
  return `${root}${withCustomer.startsWith('/') ? '' : '/'}${withCustomer}`;
}

/**
 * The OAuth scope to request for a given call. Falls back to the Rating scope,
 * which is what the proxies default to, so an unset Shipping scope behaves
 * exactly as today rather than minting a token against an empty scope.
 */
export function resolveCanadaPostScope(api) {
  return String(api?.scope || '').trim() || CANADAPOST_RATING_API.scope;
}
