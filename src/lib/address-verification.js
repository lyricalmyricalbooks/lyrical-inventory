// Address verification — the pure half of the Shipping tab's destination
// verifier.
//
// Shippo exposes two address-validation surfaces and this app has to speak
// both. The modern one is the v2 operation (`ValidateAddress` in Shippo's MCP
// tool catalogue): a GET against /v2/addresses/validate that answers with a
// graded verdict, a standardized `recommended_address`, a confidence score and
// machine-readable reasons. The legacy one is the v1 POST /addresses/ with
// `validate: true`, which answers only `validation_results.is_valid` plus free
// text — and which is all some older Shippo tokens can reach.
//
// Rather than pick one and hope, the feature calls v2 first and falls back to
// v1, so everything downstream needs a single shape to render. That is what
// normalizeAddressVerification produces. Keeping it here — pure, DOM-free and
// fetch-free — is what makes the verdict logic testable without a Shippo token
// or a browser.

/** Shippo's v2 address validation endpoint (the MCP `ValidateAddress` op). */
export const SHIPPO_VALIDATE_V2_URL = 'https://api.goshippo.com/v2/addresses/validate';

/** Shippo's legacy address endpoint; validates when `validate: true` is set. */
export const SHIPPO_ADDRESSES_V1_URL = 'https://api.goshippo.com/addresses/';

// The app's destination form uses Shippo's v1 field names (street1/city/zip),
// which is also what the shipments payload in calculateShippoRates sends. v2
// renamed every one of them. This is the single place that knows the mapping,
// so a rename never has to be chased through the UI code.
const V2_FIELD_MAP = {
  name: 'name',
  company: 'organization',
  street1: 'address_line_1',
  street2: 'address_line_2',
  city: 'city_locality',
  state: 'state_province',
  zip: 'postal_code',
  country: 'country_code',
};

/** Display order and labels for the correction diff, most significant first. */
export const ADDRESS_FIELD_LABELS = [
  ['name', 'Recipient'],
  ['company', 'Company'],
  ['street1', 'Street address'],
  ['street2', 'Apt / Suite'],
  ['city', 'City'],
  ['state', 'State / Prov'],
  ['zip', 'Zip / Postal'],
  ['country', 'Country'],
];

const str = (value) => String(value ?? '').trim();

/**
 * Shippo's v2 validator requires address_line_1 + country_code, and then either
 * a postal code or a city (a state alone can't place an address). Returned as a
 * message rather than a boolean so the caller can say which piece is missing.
 */
export function addressValidationBlocker(address = {}) {
  if (!str(address.street1)) return 'Street address is required to verify.';
  if (!str(address.country)) return 'Country is required to verify.';
  if (!str(address.city) && !str(address.zip)) {
    return 'Add a city or a postal code — Shippo needs one of them to place the address.';
  }
  return '';
}

/**
 * Query parameters for the v2 GET. Empty fields are dropped rather than sent
 * blank: Shippo treats an empty `state_province` as a supplied-but-empty value
 * and downgrades the verdict for it.
 */
export function buildAddressValidationQuery(address = {}) {
  const params = {};
  for (const [local, remote] of Object.entries(V2_FIELD_MAP)) {
    const value = str(address[local]);
    if (value) params[remote] = value;
  }
  return params;
}

/** Request body for the v1 fallback. */
export function buildLegacyValidationPayload(address = {}) {
  return {
    name: str(address.name) || 'Recipient',
    company: str(address.company),
    street1: str(address.street1),
    street2: str(address.street2),
    city: str(address.city),
    state: str(address.state),
    zip: str(address.zip),
    country: str(address.country),
    validate: true,
  };
}

/** Maps a v2 address object back onto the app's own field names. */
function addressFromV2(source) {
  if (!source || typeof source !== 'object') return null;
  const out = {};
  let filled = false;
  for (const [local, remote] of Object.entries(V2_FIELD_MAP)) {
    const value = str(source[remote]);
    out[local] = value;
    if (value) filled = true;
  }
  return filled ? out : null;
}

/** Maps a v1 address object (already using the app's field names) across. */
function addressFromV1(source) {
  if (!source || typeof source !== 'object') return null;
  const out = {};
  let filled = false;
  for (const local of Object.keys(V2_FIELD_MAP)) {
    const value = str(source[local]);
    out[local] = value;
    if (value) filled = true;
  }
  return filled ? out : null;
}

/**
 * Field-level diff between what the user typed and what Shippo recommends.
 *
 * Case and punctuation differences are what standardization *is* ("Street" →
 * "St", "M6G3H1" → "M6G 3H1"), so those count as real corrections and are
 * reported. A field the recommendation leaves blank is not a correction — v2
 * omits fields it has nothing to say about, and treating that as "delete the
 * user's data" would silently wipe an apartment number.
 */
export function addressCorrections(submitted = {}, recommended = null) {
  if (!recommended) return [];
  const diffs = [];
  for (const [field, label] of ADDRESS_FIELD_LABELS) {
    const from = str(submitted[field]);
    const to = str(recommended[field]);
    if (!to || to === from) continue;
    diffs.push({ field, label, from, to });
  }
  return diffs;
}

/**
 * v1 speaks only is_valid + free-text messages, so the verdict has to be
 * inferred: a valid address whose returned form differs from what was typed was
 * corrected, which is v2's `partially_valid`.
 */
function legacyStatus(isValid, corrections) {
  if (isValid === false) return 'invalid';
  if (isValid !== true) return 'unverified';
  return corrections.length ? 'partially_valid' : 'valid';
}

/**
 * Collapses either API's response into one shape.
 *
 * `submitted` is required for the correction diff: v2 reports which attributes
 * it changed but not what they were, and v1 reports nothing at all.
 */
export function normalizeAddressVerification(payload, submitted = {}) {
  const body = payload && typeof payload === 'object' ? payload : {};

  // v1 is identified by its validation_results envelope; v2 by its analysis
  // block. Checking for the envelope first means a v1 response is never
  // mistaken for a malformed v2 one.
  const legacy = body.validation_results && typeof body.validation_results === 'object';

  if (legacy) {
    const results = body.validation_results;
    const recommended = addressFromV1(body);
    const corrections = addressCorrections(submitted, recommended);
    const reasons = (Array.isArray(results.messages) ? results.messages : []).map(message => ({
      code: str(message?.code),
      // v1's `type` is a Shippo-internal source tag rather than a severity, so
      // severity is derived from is_valid instead of trusted from the payload.
      type: results.is_valid === false ? 'error' : 'warning',
      description: str(message?.text) || str(message?.code) || 'Shippo flagged this address.',
    }));
    let addressType = '';
    if (body.is_residential === true) addressType = 'residential';
    else if (body.is_residential === false) addressType = 'commercial';

    return {
      source: 'v1',
      status: legacyStatus(results.is_valid, corrections),
      confidence: null,
      addressType,
      reasons,
      recommended: corrections.length ? recommended : null,
      corrections,
      geo: null,
    };
  }

  const analysis = body.analysis && typeof body.analysis === 'object' ? body.analysis : {};
  const verdict = analysis.validation_result && typeof analysis.validation_result === 'object'
    ? analysis.validation_result
    : {};
  const recommended = addressFromV2(body.recommended_address);
  const corrections = addressCorrections(submitted, recommended);
  const confidenceSource = body.recommended_address?.confidence_result;
  const geoLat = Number(body.geo?.latitude);
  const geoLng = Number(body.geo?.longitude);

  return {
    source: 'v2',
    status: str(verdict.value).toLowerCase() || 'unknown',
    confidence: confidenceSource && typeof confidenceSource === 'object'
      ? {
        score: str(confidenceSource.score).toLowerCase(),
        code: str(confidenceSource.code),
        description: str(confidenceSource.description),
      }
      : null,
    addressType: str(analysis.address_type).toLowerCase(),
    reasons: (Array.isArray(verdict.reasons) ? verdict.reasons : []).map(reason => ({
      code: str(reason?.code),
      type: str(reason?.type).toLowerCase() || 'info',
      description: str(reason?.description) || str(reason?.code) || 'Shippo flagged this address.',
    })),
    recommended: corrections.length ? recommended : null,
    corrections,
    geo: Number.isFinite(geoLat) && Number.isFinite(geoLng) ? { latitude: geoLat, longitude: geoLng } : null,
  };
}

const VERDICTS = {
  valid: {
    tone: 'ok',
    icon: '✓',
    label: 'Deliverable',
    summary: 'Shippo matched this address against postal data.',
  },
  partially_valid: {
    tone: 'warn',
    icon: '✎',
    label: 'Needs corrections',
    summary: 'Shippo found the address but standardized some of it.',
  },
  unverified: {
    tone: 'warn',
    icon: '?',
    label: 'Unverified',
    summary: 'Shippo has no postal data for this destination — check it by eye before buying a label.',
  },
  invalid: {
    tone: 'err',
    icon: '✕',
    label: 'Undeliverable',
    summary: 'Shippo could not find this address. A label bought for it is likely to be returned.',
  },
  unknown: {
    tone: 'warn',
    icon: '?',
    label: 'No verdict',
    summary: 'Shippo answered without a verdict for this address.',
  },
};

/** Badge copy for a normalized status. Never returns undefined. */
export function verificationVerdict(status) {
  return VERDICTS[str(status).toLowerCase()] || VERDICTS.unknown;
}

/**
 * Whether a result is safe to buy a label against. `unverified` counts: plenty
 * of real international destinations have no postal database behind them, and
 * blocking those would make the verifier worse than not having one.
 */
export function isDeliverable(result) {
  const status = str(result?.status).toLowerCase();
  return status === 'valid' || status === 'partially_valid' || status === 'unverified';
}

/**
 * Stable identity for an address, so a verdict can be tied to the exact text it
 * was produced from. Any edit to the destination form changes the signature,
 * which is what lets the panel go stale instead of vouching for an address the
 * user has since changed.
 */
export function addressSignature(address = {}) {
  return ADDRESS_FIELD_LABELS
    .map(([field]) => str(address[field]).toLowerCase().replace(/\s+/g, ' '))
    .join('|');
}

// ─── Order records ────────────────────────────────────────────────────────
//
// The Shipping tab's form, the shipments payload and the verifier all speak
// street1/city/zip. An order in the ledger does not — history entries have
// carried shipAddr1/shipProvince/shipPostal since long before any of this. The
// two mappings are kept apart on purpose: this one is about the *stored record*
// and V2_FIELD_MAP is about the *wire format*, and conflating them is how a
// field ends up silently blank on one side.

/** A history record's own field names for a shipping address. */
export const ORDER_ADDRESS_FIELDS = {
  name: 'shipName',
  // Orders have never stored a company separately from the recipient name;
  // mapped anyway so the shape is complete and a future field just works.
  company: 'shipCompany',
  street1: 'shipAddr1',
  street2: 'shipAddr2',
  city: 'shipCity',
  state: 'shipProvince',
  zip: 'shipPostal',
  country: 'shipCountry',
};

/** Reads an order/history record into the shape the verifier speaks. */
export function addressFromOrder(order = {}) {
  const out = {};
  for (const [local, stored] of Object.entries(ORDER_ADDRESS_FIELDS)) {
    out[local] = str(order[stored]);
  }
  return out;
}

/**
 * Turns accepted corrections into a patch keyed by the record's own field
 * names, ready to assign onto a history entry. Only the corrected fields
 * appear, so nothing else on the order is touched.
 */
export function orderAddressPatch(corrections = []) {
  const patch = {};
  corrections.forEach(correction => {
    const stored = ORDER_ADDRESS_FIELDS[correction?.field];
    if (stored && str(correction.to)) patch[stored] = str(correction.to);
  });
  return patch;
}

/**
 * The slice of a verification worth writing to Firestore alongside the order.
 *
 * Not the whole result: `recommended` is dropped because `corrections` already
 * carries every from/to pair the UI needs, and the reason list is capped so a
 * chatty response can't bloat a book document that syncs on every save.
 */
export function persistableVerification(result, signature, at = new Date().toISOString()) {
  if (!result) return null;
  return {
    signature,
    at,
    status: str(result.status) || 'unknown',
    source: str(result.source) || 'v2',
    addressType: str(result.addressType),
    reasons: (result.reasons || []).slice(0, 4).map(reason => ({
      code: str(reason.code),
      type: str(reason.type),
      description: str(reason.description).slice(0, 240),
    })),
    corrections: (result.corrections || []).map(correction => ({
      field: str(correction.field),
      label: str(correction.label),
      from: str(correction.from),
      to: str(correction.to),
    })),
  };
}

/**
 * Whether a stored verification still describes the address on the record.
 * An order edited after it was checked reverts to unverified rather than
 * carrying a verdict that was never about this address.
 */
export function storedVerificationIsCurrent(stored, order) {
  if (!stored?.signature) return false;
  return stored.signature === addressSignature(addressFromOrder(order));
}

/** Human-readable address block, blank lines dropped. */
export function formatAddressLines(address = {}) {
  const cityLine = [str(address.city), str(address.state)].filter(Boolean).join(', ');
  return [
    str(address.name),
    str(address.company),
    str(address.street1),
    str(address.street2),
    [cityLine, str(address.zip)].filter(Boolean).join('  '),
    str(address.country).toUpperCase(),
  ].filter(Boolean);
}
