/**
 * Canada Post Direct REST API & Rating Client
 *
 * Rules of engagement live in docs/canada-post-rating-api.md. Read them before
 * changing anything here: the SOAP/XML service and the username:password Basic
 * pattern were retired, OAuth 2.0 bearer tokens have been mandatory since
 * 2026-04-30, and most examples found online still document the dead pattern.
 *
 * Implements official Canada Post Web Services REST API:
 * - Rating & Pricing: /prod/devportal-portaildesdeveloppeurs/rating/v1/prices
 * - Tracking: /prod/devportal-portaildesdeveloppeurs/tracking/v1/pins/{pin}/summaries
 * - Service Discovery & Connection Test
 * - Offline-first fallback estimation for Canadian domestic and cross-border shipments
 */

import {
  addLabelToArchive,
  findArchivedLabel,
  pruneLabelArchive,
  listArchivedLabels,
  archiveKeyForPin,
} from './label-archive.js';
import {
  CANADAPOST_RATING_API,
  CANADAPOST_TRACKING_API,
  CANADAPOST_SHIPPING_API,
  resolveShipmentEndpoint,
  resolveCanadaPostScope,
  resolveCanadaPostProduct,
} from './canadapost-endpoints.js';
import { parseShipmentResponse, describeNextStep } from './canadapost-shipment.js';
import {
  missingSenderFields,
  senderAddressIsPlaceholder,
} from './shipping-readiness.js';

// The modern Developer Portal serves both environments from ONE host. The old
// ct.soa-gw / soa-gw split is gone, so which environment a request lands in is
// decided by the credentials, not the URL. Nothing in this file can tell a
// development key from a production one, which is why sandbox mode is worded as
// a property of the key rather than a promise that nothing will be charged.
export const CANADAPOST_PRODUCTION_URL = 'https://api.canadapost-postescanada.ca';
export const CANADAPOST_SANDBOX_URL = 'https://api.canadapost-postescanada.ca';

/**
 * Standard Canada Post service codes and user-friendly labels
 */
export const CANADAPOST_SERVICES = {
  'DOM.RP': { name: 'Regular Parcel', category: 'domestic', speed: '2-9 business days' },
  'DOM.EP': { name: 'Expedited Parcel', category: 'domestic', speed: '1-7 business days' },
  'DOM.XP': { name: 'Xpresspost', category: 'domestic', speed: '1-2 business days' },
  'DOM.PC': { name: 'Priority', category: 'domestic', speed: 'Next business day' },
  'USA.SP.AIR': { name: 'Small Packet - USA Air', category: 'usa', speed: '5-8 business days' },
  'USA.SP.SURF': { name: 'Small Packet - USA Surface', category: 'usa', speed: '2-3 weeks' },
  'USA.TP': { name: 'Tracked Packet - USA', category: 'usa', speed: '4-7 business days' },
  'USA.XP': { name: 'Xpresspost - USA', category: 'usa', speed: '2-3 business days' },
  'USA.EP': { name: 'Expedited Parcel - USA', category: 'usa', speed: '4-7 business days' },
  'USA.PW.PARCEL': { name: 'Priority Worldwide - USA', category: 'usa', speed: '1 business day' },
  'INT.SP.AIR': { name: 'Small Packet - International Air', category: 'international', speed: '6-12 business days' },
  'INT.SP.SURF': { name: 'Small Packet - International Surface', category: 'international', speed: '4-12 weeks' },
  'INT.TP': { name: 'Tracked Packet - International', category: 'international', speed: '6-10 business days' },
  'INT.XP': { name: 'Xpresspost - International', category: 'international', speed: '4-7 business days' },
  'INT.IP.AIR': { name: 'International Parcel - Air', category: 'international', speed: '12+ business days' },
  'INT.IP.SURF': { name: 'International Parcel - Surface', category: 'international', speed: '4-12 weeks' }
};

export const US_STATES = {
  'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
  'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
  'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
  'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
  'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
  'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
  'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
  'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY',
  'DISTRICT OF COLUMBIA': 'DC', 'PUERTO RICO': 'PR', 'GUAM': 'GU', 'VIRGIN ISLANDS': 'VI'
};

export const CA_PROVINCES = {
  'ALBERTA': 'AB', 'BRITISH COLUMBIA': 'BC', 'MANITOBA': 'MB', 'NEW BRUNSWICK': 'NB',
  'NEWFOUNDLAND': 'NL', 'NEWFOUNDLAND AND LABRADOR': 'NL', 'NOVA SCOTIA': 'NS',
  'NORTHWEST TERRITORIES': 'NT', 'NUNAVUT': 'NU', 'ONTARIO': 'ON', 'PRINCE EDWARD ISLAND': 'PE',
  'QUEBEC': 'QC', 'SASKATCHEWAN': 'SK', 'YUKON': 'YT', 'YUKON TERRITORY': 'YT'
};

/**
 * Normalize state or province string to 2-letter uppercase postal code (e.g. Arizona -> AZ, Ontario -> ON)
 */
export function normalizeStateOrProvince(val, countryCode = '') {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  const c = String(countryCode || '').toUpperCase().trim();

  if (c === 'US' || !c) {
    if (US_STATES[upper]) return US_STATES[upper];
  }
  if (c === 'CA' || !c) {
    if (CA_PROVINCES[upper]) return CA_PROVINCES[upper];
  }
  if (upper.length === 2) return upper;
  return upper;
}

/**
 * Clean and format Canadian postal code to standard format without spaces (e.g. M4B1B3)
 */
export function cleanPostalCode(postalCode) {
  return String(postalCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/**
 * Build the JSON mailing-scenario payload for Canada Post Rating API 4.0.0 /prices
 */
export function buildRateScenarioJson({
  originPostalCode = 'M4B1B3',
  destCountry = 'CA',
  destPostalOrZip = '',
  weightKg = 0.5,
  lengthCm = 20,
  widthCm = 15,
  heightCm = 2,
  customerNumber = '',
  contractId = '',
  quoteType = 'auto'
}) {
  const origin = cleanPostalCode(originPostalCode) || 'M4B1B3';
  const dest = String(destCountry || 'CA').toUpperCase().trim();
  // Canada Post parcel services require a minimum parcel weight floor (0.1 kg / 100g)
  const weight = Math.max(0.1, parseFloat(weightKg || 0.5));
  const length = Math.max(0.1, parseFloat(lengthCm || 20));
  const width = Math.max(0.1, parseFloat(widthCm || 15));
  const height = Math.max(0.1, parseFloat(heightCm || 2));

  let destJson = {};
  if (dest === 'CA') {
    destJson = { domestic: { postalCode: cleanPostalCode(destPostalOrZip) || 'V6B2W9' } };
  } else if (dest === 'US') {
    destJson = { unitedStates: { zipCode: String(destPostalOrZip || '90210').replace(/[^0-9A-Z]/gi, '').slice(0, 5) || '90210' } };
  } else {
    destJson = { international: { countryCode: dest } };
  }

  const payload = {
    parcelCharacteristics: {
      weight: Number(weight.toFixed(3)),
      dimensions: {
        length: Number(length.toFixed(1)),
        width: Number(width.toFixed(1)),
        height: Number(height.toFixed(1))
      }
    },
    originPostalCode: origin,
    destination: destJson
  };

  // Canada Post offers two kinds of quote and they are mutually exclusive:
  //
  //   commercial — the account's negotiated rates. Requires a customer number,
  //                and the account must actually be set up for the route being
  //                quoted. An account with no commercial agreement gets an EMPTY list
  //                back, not an error.
  //   counter    — published retail rates. Requires that NO customer number or
  //                contract id be sent at all.
  //
  // 'auto' means commercial when a customer number exists; getCanadaPostRates falls
  // back to counter when that comes back empty. Payload keys are strictly camelCase.
  const resolvedType = quoteType === 'auto'
    ? (customerNumber ? 'commercial' : 'counter')
    : quoteType;

  if (resolvedType === 'commercial' && customerNumber) {
    payload.customerNumber = customerNumber.trim();
    payload.quoteType = 'commercial';
    if (contractId) {
      payload.contractId = contractId.trim();
    }
  } else {
    payload.quoteType = 'counter';
  }

  return JSON.stringify(payload);
}

/**
 * Parse Canada Post JSON price quotes response
 */
export function parseCanadaPostPriceQuotes(jsonText) {
  if (!jsonText || typeof jsonText !== 'string') {
    throw new Error('Empty response from Canada Post Rating API');
  }

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    // If it's HTML or some non-JSON error page
    throw new Error('Invalid JSON response from Canada Post Rating API');
  }

  // Check for error messages
  // The Developer Portal returns errors as a flat array — {"messages":[{code,
  // description}]} — while the legacy gateway nested them as messages.message.
  // Only the nested shape was checked, so a real Portal error fell through
  // every branch below and surfaced as an empty service list: Canada Post was
  // saying exactly what was wrong and the card showed "0 available".
  const messageList = Array.isArray(data.messages)
    ? data.messages
    : (data.messages && data.messages.message
        ? (Array.isArray(data.messages.message) ? data.messages.message : [data.messages.message])
        : null);

  if (messageList && messageList.length) {
    const msg = messageList[0] || {};
    const code = msg.code || 'ERROR';
    const err = new Error(`Canada Post [${code}]: ${msg.description || 'Unknown Canada Post error'}`);
    err.canadaPostCode = String(code);
    // More than one message can come back at once; keep the rest for the log.
    if (messageList.length > 1) {
      err.additionalMessages = messageList.slice(1).map(m => `[${m.code}] ${m.description}`);
    }
    throw err;
  }
  // Alternate error shape
  if (data.code && data.description) {
    throw new Error(`Canada Post [${data.code}]: ${data.description}`);
  }
  if (data.fault && data.fault.faultstring) {
    throw new Error(`Canada Post [ERROR]: ${data.fault.faultstring}`);
  }

  const quotes = [];
  const rootQuotes = data.priceQuotes || data['price-quotes'] || data.prices || data.rates || data.services || (Array.isArray(data) ? data : {});
  const priceQuotes = Array.isArray(rootQuotes)
    ? rootQuotes
    : (rootQuotes.priceQuote || rootQuotes['price-quote'] || rootQuotes.quote || rootQuotes.service || (Array.isArray(data.priceQuote) ? data.priceQuote : []));
  const quoteArray = Array.isArray(priceQuotes) ? priceQuotes : (priceQuotes ? [priceQuotes] : []);

  for (const quote of quoteArray) {
    if (!quote) continue;
    const serviceCode = quote.serviceCode || quote['service-code'] || quote.code || quote.serviceId || '';
    const serviceName = quote.serviceName || quote['service-name'] || quote.name || quote.serviceDescription || CANADAPOST_SERVICES[serviceCode]?.name || serviceCode;

    const priceDetails = quote.priceDetails || quote['price-details'] || quote.pricing || quote.price || {};
    const basePrice = parseFloat(priceDetails.base || priceDetails.basePrice || quote.basePrice || quote.base || 0);
    const duePrice = parseFloat(priceDetails.due || priceDetails.duePrice || priceDetails.total || quote.totalPrice || quote.total || quote.due || basePrice);
    
    let gstPrice = 0, pstPrice = 0, hstPrice = 0;
    const taxesObj = priceDetails.taxes || priceDetails.taxBreakdown || {};
    gstPrice = parseFloat(taxesObj.gst || 0);
    pstPrice = parseFloat(taxesObj.pst || 0);
    hstPrice = parseFloat(taxesObj.hst || 0);
    const totalTaxes = Math.round((gstPrice + pstPrice + hstPrice) * 100) / 100 || parseFloat(priceDetails.taxes?.total || priceDetails.tax || quote.tax || 0);

    const serviceStandard = quote.serviceStandard || quote['service-standard'] || quote.standard || {};
    const transitDays = serviceStandard.expectedTransitTime || serviceStandard['expected-transit-time'] || serviceStandard.transitDays || quote.transitDays;
    const deliveryDate = serviceStandard.expectedDeliveryDate || serviceStandard['expected-delivery-date'] || serviceStandard.deliveryDate || quote.deliveryDate || null;

    quotes.push({
      serviceCode,
      serviceName,
      currency: quote.currency || priceDetails.currency || 'CAD',
      basePrice,
      totalPrice: duePrice,
      taxes: totalTaxes,
      gst: gstPrice,
      pst: pstPrice,
      hst: hstPrice,
      transitDays: transitDays != null ? parseInt(transitDays, 10) : null,
      deliveryDate,
      estimatedSpeed: transitDays != null ? `${transitDays} business day${parseInt(transitDays, 10) === 1 ? '' : 's'}` : (CANADAPOST_SERVICES[serviceCode]?.speed || 'Standard')
    });
  }

  quotes.sort((a, b) => a.totalPrice - b.totalPrice);
  return quotes;
}

// NOTE ON CREDENTIALS
// These are deliberately empty. This app is served as a static bundle from
// GitHub Pages, so anything written here is readable by anyone who opens the
// page source — a shipping credential in this file is a published credential.
// The publisher's own key, secret and customer number are entered once in the
// Tax Centre and read from saved settings; nothing falls back to a built-in
// account. Code that needs credentials asks for them and fails loudly when
// they are absent, rather than quietly shipping on somebody else's account.
export const DEFAULT_CP_API_KEY = '';
export const DEFAULT_CP_API_SECRET = '';
export const DEFAULT_CP_CUSTOMER_NUMBER = '';

// ── TWO CREDENTIAL SETS ───────────────────────────────────────────────────
//
// Canada Post's Developer Portal issues a separate Client ID and Secret for
// sandbox and for production, and both are used against the SAME gateway — the
// key is the only thing that decides which environment a request lands in.
// One shared pair therefore meant switching environments was a retype: paste
// the sandbox key to rehearse, paste the live key to ship, and hope the toggle
// matched whichever was in the box. Holding both lets the Sandbox toggle
// actually select a set instead of only relabelling the screen.
export const CANADAPOST_CREDENTIAL_FIELDS = {
  live: {
    apiKey: 'cpLiveApiKey',
    apiSecret: 'cpLiveApiSecret',
    customerNumber: 'cpLiveCustomerNumber',
    contractId: 'cpLiveContractId',
  },
  test: {
    apiKey: 'cpTestApiKey',
    apiSecret: 'cpTestApiSecret',
    customerNumber: 'cpTestCustomerNumber',
    contractId: 'cpTestContractId',
  },
};

// The single set that existed before. Still read, so a configuration saved by
// an earlier version keeps working untouched until it is migrated.
const CANADAPOST_LEGACY_FIELDS = {
  apiKey: 'cpApiKey',
  apiSecret: 'cpApiSecret',
  customerNumber: 'cpCustomerNumber',
  contractId: 'cpContractId',
};

const asText = (value) => String(value ?? '').trim();

/** Read one named credential set verbatim, with no fallback to the other. */
export function readCanadaPostCredentialSet(settings = {}, mode = 'live') {
  const fields = CANADAPOST_CREDENTIAL_FIELDS[mode] || CANADAPOST_CREDENTIAL_FIELDS.live;
  return {
    apiKey: asText(settings[fields.apiKey]),
    apiSecret: asText(settings[fields.apiSecret]),
    customerNumber: asText(settings[fields.customerNumber]),
    contractId: asText(settings[fields.contractId]),
  };
}

/** True when a set has both halves of a usable credential. */
export function credentialSetIsConfigured(set = {}) {
  return !!(asText(set.apiKey) && asText(set.apiSecret));
}

/**
 * Which credentials a request will actually be sent with.
 *
 * The Sandbox toggle picks the set. When the chosen set is empty but a
 * pre-split configuration exists, those legacy values stand in — they were
 * saved for whichever mode was active at the time, so they belong to the mode
 * asking for them now, and falling back keeps an existing setup working on the
 * first load after this change rather than silently losing its key.
 */
export function resolveCanadaPostCredentials(settings = {}) {
  const isTest = !!settings.cpTestMode;
  const mode = isTest ? 'test' : 'live';
  const chosen = readCanadaPostCredentialSet(settings, mode);
  const legacy = {
    apiKey: asText(settings[CANADAPOST_LEGACY_FIELDS.apiKey]),
    apiSecret: asText(settings[CANADAPOST_LEGACY_FIELDS.apiSecret]),
    customerNumber: asText(settings[CANADAPOST_LEGACY_FIELDS.customerNumber]),
    contractId: asText(settings[CANADAPOST_LEGACY_FIELDS.contractId]),
  };

  const usingLegacy = !credentialSetIsConfigured(chosen) && credentialSetIsConfigured(legacy);
  const active = usingLegacy ? legacy : chosen;

  return {
    ...active,
    mode,
    isTest,
    usingLegacy,
    // Whether the OTHER set is ready, so the screen can say what switching the
    // toggle would do before the toggle is switched.
    liveConfigured: credentialSetIsConfigured(readCanadaPostCredentialSet(settings, 'live')) || (!isTest && usingLegacy),
    testConfigured: credentialSetIsConfigured(readCanadaPostCredentialSet(settings, 'test')) || (isTest && usingLegacy),
  };
}

/**
 * Move a pre-split configuration into the set it belongs to.
 *
 * The old fields were used for whichever mode was active when they were saved,
 * so that is the set they go into — putting a production key in the sandbox
 * boxes would make "sandbox" purchases real, and the reverse would make live
 * shipping fail. Returns which set was written so the card can say so; a
 * publisher who had the toggle wrong can then move it themselves.
 *
 * Mutates `settings` in place and does NOT persist — the next save writes it.
 *
 * @returns {{migrated: boolean, mode: string}}
 */
export function migrateCanadaPostCredentials(settings) {
  if (!settings || typeof settings !== 'object') return { migrated: false, mode: '' };

  const legacyKey = asText(settings[CANADAPOST_LEGACY_FIELDS.apiKey]);
  const legacySecret = asText(settings[CANADAPOST_LEGACY_FIELDS.apiSecret]);
  if (!legacyKey && !legacySecret) return { migrated: false, mode: '' };

  const mode = settings.cpTestMode ? 'test' : 'live';
  const fields = CANADAPOST_CREDENTIAL_FIELDS[mode];

  // Never overwrite a set the publisher has already filled in themselves.
  if (credentialSetIsConfigured(readCanadaPostCredentialSet(settings, mode))) {
    return { migrated: false, mode };
  }

  settings[fields.apiKey] = legacyKey;
  settings[fields.apiSecret] = legacySecret;
  settings[fields.customerNumber] = asText(settings[CANADAPOST_LEGACY_FIELDS.customerNumber]);
  settings[fields.contractId] = asText(settings[CANADAPOST_LEGACY_FIELDS.contractId]);

  // Clear the old fields so there is exactly one place each credential lives.
  for (const legacyField of Object.values(CANADAPOST_LEGACY_FIELDS)) {
    settings[legacyField] = '';
  }

  return { migrated: true, mode };
}

/**
 * Resolve which Canada Post environment a set of settings will actually hit.
 *
 * Both modes now address the same gateway (see the URL constants above), so
 * this deliberately does NOT claim a sandbox shipment is free. It used to, and
 * that was the most expensive sentence in the app: with Sandbox Test Mode on
 * and a production key pasted in, "Nothing is charged and no label is valid for
 * mailing" sat directly above a Buy Label button that charged a real account.
 */
export function resolveCanadaPostEnvironment({ isTest = false } = {}) {
  const sandbox = !!isTest;
  return {
    isTest: sandbox,
    mode: sandbox ? 'sandbox' : 'live',
    baseUrl: sandbox ? CANADAPOST_SANDBOX_URL : CANADAPOST_PRODUCTION_URL,
    hostname: 'api.canadapost-postescanada.ca',
    sharedGateway: true,
    label: sandbox ? 'Sandbox Test Mode' : 'Live Production Mode',
    description: sandbox
      ? 'Canada Post serves test and live from the same address, so your credentials decide which one you get. '
        + 'With a Developer Portal development key nothing is charged; with a production key this buys a real, billable label.'
      : 'Shipments are created against your live Canada Post account, charged to your card on file, and appear in the Online Business Centre.'
  };
}

/**
 * Canada Post customer numbers are 7 to 10 digits (commonly zero-padded to 10).
 */
export function isValidCustomerNumber(customerNumber) {
  const digits = String(customerNumber || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 10;
}

export function normalizeCustomerNumber(customerNumber) {
  return String(customerNumber || '').replace(/\D/g, '').slice(0, 10);
}

/**
 * True when a usable Canada Post key and secret have been configured.
 */
export function hasCanadaPostCredentials({ apiKey = '', apiSecret = '' } = {}) {
  return !!String(apiKey || '').trim() && !!String(apiSecret || '').trim();
}

// Simulation exists to let the shipping screen be laid out and rehearsed without
// a live account. Sandbox mode is the only place it is allowed: outside it, an
// unreachable gateway is reported as the failure it is.
function isSimulationAllowed({ isTest }) {
  return !!isTest;
}

/**
 * Build a test-mode shipment.
 *
 * One factory for both reasons a sandbox run cannot reach Canada Post — the
 * gateway was unreachable, or label creation is not configured yet — so the two
 * paths cannot drift into producing differently-shaped results. Everything it
 * returns is marked `isSimulated`, and `simulationReason` says in plain words
 * why, because that sentence is shown to the shop owner rather than logged.
 */
export function simulateCanadaPostShipment(reason) {
  const stamp = Date.now().toString();
  const mockTrackingPin = `7012${stamp.slice(-12)}`;
  return {
    ok: true,
    shipmentId: `CP-SHIP-${stamp.slice(-8)}`,
    trackingPin: mockTrackingPin,
    labelUrl: `local://canadapost/label/${mockTrackingPin}`,
    receiptUrl: `local://canadapost/label/${mockTrackingPin}`,
    isSimulated: true,
    simulationReason: reason || 'Canada Post gateway unreachable'
  };
}

/**
 * Audit a Canada Post configuration before any money is spent.
 * Returns the resolved environment plus blocking errors and non-blocking warnings,
 * so the publisher can see exactly which account a label will be billed to.
 */
export function validateCanadaPostAccount({
  apiKey = '',
  apiSecret = '',
  customerNumber = '',
  contractId = '',
  isTest = false
} = {}) {
  const env = resolveCanadaPostEnvironment({ isTest });
  const errors = [];
  const warnings = [];

  const key = String(apiKey || '').trim();
  const secret = String(apiSecret || '').trim();
  const custDigits = normalizeCustomerNumber(customerNumber);
  const configured = hasCanadaPostCredentials({ apiKey: key, apiSecret: secret });

  if (!key) errors.push('Canada Post API key is missing. Add it in Tax Centre → Canada Post Direct API.');
  if (!secret) errors.push('Canada Post API secret / password is missing. Add it in Tax Centre → Canada Post Direct API.');
  if (!custDigits) {
    errors.push('Canada Post customer number is missing — labels cannot be attached to your account without it.');
  } else if (!isValidCustomerNumber(custDigits)) {
    errors.push(`Canada Post customer number "${custDigits}" is ${custDigits.length} digits; it must be 7 to 10 digits.`);
  }

  if (env.isTest) {
    warnings.push('Sandbox Test Mode is on, but Canada Post serves test and live from the same address. '
      + 'This is only a test if the key above is a Developer Portal development key — a production key still buys a real label and charges your account.');
  }
  if (contractId && !env.isTest && !custDigits) {
    warnings.push('A contract ID is set without a customer number; contract rates will not be applied.');
  }

  return {
    ok: errors.length === 0,
    environment: env,
    mode: env.mode,
    configured,
    customerNumber: custDigits,
    errors,
    warnings
  };
}

export function getSavedSheetsUrl() {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      const url = localStorage.getItem('lm-sheets-url') || localStorage.getItem('lm-notify-url') || localStorage.getItem('lm-last-sheets-url') || '';
      if (url) return url;
    }
  } catch (_) {}
  try {
    if (typeof window !== 'undefined') {
      if (window.sheetsUrl) return window.sheetsUrl;
      if (window.notifyUrl) return window.notifyUrl;
    }
  } catch (_) {}
  return '';
}

// Code 128 symbol patterns, one per code value 0-106. Each string is the six
// module widths of that symbol, starting with a bar and alternating
// bar/space; 106 (Stop) carries a seventh module for the termination bar.
// 103/104/105 are Start A/B/C.
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

const CODE128_START_B = 104;
const CODE128_START_C = 105;
const CODE128_STOP = 106;

/**
 * Encode a string as a real Code 128 symbol.
 *
 * This used to be a decorative pattern derived from a per-character hash — bars
 * that looked like a barcode and scanned as nothing. A courier label whose
 * barcode does not carry the tracking number is worse than one with no barcode
 * at all, because the failure only shows up at the counter.
 *
 * Numeric payloads of even length go through Set C (two digits per symbol,
 * which is what carrier labels use); everything else goes through Set B.
 * Returns null for input Code 128 cannot represent, so callers can fall back
 * to printing the number rather than drawing meaningless bars.
 *
 * @returns {{modules: string, codes: number[], checksum: number}|null}
 */
export function encodeCode128(text) {
  const value = String(text ?? '');
  if (!value) return null;

  const codes = [];
  const useSetC = /^\d+$/.test(value) && value.length >= 4 && value.length % 2 === 0;
  if (useSetC) {
    codes.push(CODE128_START_C);
    for (let i = 0; i < value.length; i += 2) codes.push(parseInt(value.slice(i, i + 2), 10));
  } else {
    codes.push(CODE128_START_B);
    for (const ch of value) {
      const point = ch.charCodeAt(0);
      // Set B covers ASCII 32-126. Anything else cannot be encoded, and
      // silently dropping it would produce a barcode for a different string.
      if (point < 32 || point > 126) return null;
      codes.push(point - 32);
    }
  }

  // Modulo-103 weighted checksum: start symbol x1, then position 1, 2, 3...
  let checksum = codes[0];
  for (let i = 1; i < codes.length; i++) checksum += codes[i] * i;
  checksum %= 103;
  codes.push(checksum);
  codes.push(CODE128_STOP);

  let modules = '';
  for (const code of codes) {
    const widths = CODE128_PATTERNS[code];
    if (!widths) return null;
    let isBar = true;
    for (const w of widths) {
      modules += (isBar ? '1' : '0').repeat(Number(w));
      isBar = !isBar;
    }
  }

  return { modules, codes, checksum };
}

/**
 * Draw a scannable Code 128 barcode as SVG <rect> elements.
 *
 * `width` is the full drawing width including the 10-module quiet zone Code 128
 * requires on each side; without it a scanner has nothing to lock onto, however
 * crisp the bars themselves are.
 */
export function generateCode128SvgBars(text, { x = 0, y = 0, width = 400, height = 80 } = {}) {
  // Set B has no lowercase problem, but Canada Post PINs are digits and the
  // callers pass formatted values ("7012 3456 ..."), so separators go first.
  const clean = String(text || '').replace(/[^A-Za-z0-9 \-]/g, '').replace(/\s+/g, '').toUpperCase();
  if (!clean) return '';

  const encoded = encodeCode128(clean);
  if (!encoded) return '';

  const QUIET_MODULES = 10;
  const totalModules = encoded.modules.length + QUIET_MODULES * 2;
  const moduleWidth = width / totalModules;
  const originX = x + QUIET_MODULES * moduleWidth;

  let rects = '';
  let runStart = -1;
  const flush = (endIndex) => {
    if (runStart < 0) return;
    const runWidth = (endIndex - runStart) * moduleWidth;
    rects += `<rect x="${(originX + runStart * moduleWidth).toFixed(3)}" y="${y}" width="${runWidth.toFixed(3)}" height="${height}" fill="#000000"/>`;
    runStart = -1;
  };
  for (let i = 0; i < encoded.modules.length; i++) {
    if (encoded.modules[i] === '1') {
      if (runStart < 0) runStart = i;
    } else {
      flush(i);
    }
  }
  flush(encoded.modules.length);

  return rects;
}

/**
 * Cache for last purchased shipment context to enable instant high-res label regeneration
 */
export let lastPurchasedShipmentContext = null;

export function setLastPurchasedShipmentContext(ctx) {
  lastPurchasedShipmentContext = ctx;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('lm_last_cp_shipment', JSON.stringify(ctx));
      // Also keep it alongside every earlier purchase, so a label bought last
      // week can still be reprinted when Canada Post is unreachable. Test-mode
      // shipments are kept too — they stay flagged `isSimulated` wherever they
      // are listed, and a sandbox run that cannot be reprinted cannot rehearse
      // the reprint path, which is most of what a sandbox run is for.
      const archive = addLabelToArchive(readLabelArchive(), ctx);
      localStorage.setItem(LABEL_ARCHIVE_KEY, JSON.stringify(archive));
    }
  } catch (_) {}
}

const LABEL_ARCHIVE_KEY = 'lm_cp_label_archive';

/** Every purchase still held on this device, newest first. */
export function readLabelArchive() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(LABEL_ARCHIVE_KEY);
    return raw ? pruneLabelArchive(JSON.parse(raw)) : [];
  } catch (_) {
    return [];
  }
}

/**
 * The shipment behind a tracking PIN, for redrawing its label with no network.
 * Falls back to the most recent purchase when the PIN matches it.
 */
export function getArchivedShipmentContext(pin) {
  const found = findArchivedLabel(readLabelArchive(), pin);
  if (found) return found;

  const last = getLastPurchasedShipmentContext();
  if (last && archiveKeyForPin(last.trackingPin) === archiveKeyForPin(pin)) return last;
  return null;
}

/** Past purchases as a list, for a "reprint an earlier label" picker. */
export function listArchivedShipments() {
  return listArchivedLabels(readLabelArchive());
}

export function getLastPurchasedShipmentContext() {
  if (lastPurchasedShipmentContext) return lastPurchasedShipmentContext;
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('lm_last_cp_shipment');
      if (saved) return JSON.parse(saved);
    }
  } catch (_) {}
  return null;
}

/**
 * Draw the app's own 4x6 reference copy of a shipment.
 *
 * This is NOT a mailable label and never was — only the PDF artifact Canada
 * Post returns can be presented at a counter. It is drawn so a shipment can be
 * reviewed, filed and reprinted offline, and it is marked on its face so a copy
 * that reaches a printer cannot be mistaken for the real thing. It used to
 * carry a "POSTAGE PAID / PORT PAYÉ" indicia and nothing to contradict it,
 * which is exactly the wrong way round.
 */
export function generateCanadaPostLabelSvg({
  serviceCode = 'DOM.EP',
  serviceName = 'Expedited Parcel / Colis accéléré',
  trackingPin = '7012 3456 7890 1234',
  _shipmentId = '',
  orderNum = 'ORD-2026',
  sender = {},
  destination = {},
  parcel = {},
  customs = null,
  declarationId = '',
  customerNumber = ''
}) {
  const sfName = sender.name || 'Lyricalmyrical Books';
  const sfAddr1 = sender.address1 || '123 Main St';
  const sfAddr2 = sender.address2 || '';
  const sfCity = sender.city || 'Toronto';
  const sfProv = sender.province || 'ON';
  const sfZip = cleanPostalCode(sender.postalCode) || 'M4B 1B3';
  const sfPhone = sender.phone || '416-555-0199';

  const stName = destination.name || 'Customer';
  const stCompany = destination.company || '';
  const stAddr1 = destination.address1 || '';
  const stAddr2 = destination.address2 || '';
  const stCity = destination.city || '';
  const stState = destination.state || destination.province || '';
  const stZip = destination.postalCode || destination.zip || '';
  const stCountry = String(destination.countryCode || 'CA').toUpperCase();
  const stPhone = destination.phone || '';

  const weightKg = parseFloat(parcel.weightKg || 0.5).toFixed(3);
  const weightLb = (parseFloat(weightKg) * 2.20462).toFixed(2);
  const lengthCm = parseFloat(parcel.lengthCm || 20).toFixed(1);
  const widthCm = parseFloat(parcel.widthCm || 15).toFixed(1);
  const heightCm = parseFloat(parcel.heightCm || 2).toFixed(1);

  const cleanPin = String(trackingPin || '7012345678901234').replace(/[^0-9A-Z]/gi, '');
  const formattedPin = cleanPin.replace(/(\d{4})(?=\d)/g, '$1 ');
  const sName = CANADAPOST_SERVICES[serviceCode]?.name || serviceName || 'Expedited Parcel';
  const isCrossBorder = stCountry !== 'CA';
  const todayDate = new Date().toISOString().split('T')[0];

  const barcodeBars = generateCode128SvgBars(cleanPin, { x: 80, y: 590, width: 640, height: 110 });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1200" width="800" height="1200" style="background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <!-- Outer Cut & Margin Border -->
    <rect x="15" y="15" width="770" height="1170" fill="#ffffff" stroke="#000000" stroke-width="4" rx="4"/>

    <!-- TOP HEADER: Canada Post Banner -->
    <rect x="15" y="15" width="770" height="95" fill="#D82A2A"/>
    <g transform="translate(35, 30)">
      <!-- Canada Post Maple Leaf Logo Symbol -->
      <path d="M25 5 L30 18 L44 14 L37 26 L50 33 L35 37 L38 52 L26 42 L24 55 L21 42 L10 52 L13 37 L0 33 L13 26 L6 14 L20 18 Z" fill="#ffffff"/>
      <text x="65" y="32" fill="#ffffff" font-size="24" font-weight="900" letter-spacing="1">CANADA POST</text>
      <text x="65" y="52" fill="#ffffff" font-size="16" font-weight="700" letter-spacing="0.5">POSTES CANADA</text>
    </g>

    <!-- REFERENCE-COPY BOX (occupies the footprint of a real indicia) -->
    <rect x="550" y="25" width="220" height="75" fill="#ffffff" stroke="#000000" stroke-width="2"/>
    <text x="660" y="45" font-size="12" font-weight="900" text-anchor="middle" fill="#B00020">NOT VALID FOR MAILING</text>
    <text x="660" y="61" font-size="9" font-weight="700" text-anchor="middle" fill="#B00020">REFERENCE COPY / COPIE DE RÉFÉRENCE</text>
    <text x="660" y="78" font-size="9" font-weight="600" text-anchor="middle" fill="#333333">Cust #: ${escapeXml(customerNumber || '—')} · ${todayDate}</text>

    <!-- SERVICE NAME STRIP -->
    <rect x="15" y="110" width="770" height="50" fill="#000000"/>
    <text x="400" y="143" fill="#ffffff" font-size="22" font-weight="900" text-anchor="middle" letter-spacing="1.5">${escapeXml(sName.toUpperCase())}</text>

    <!-- SENDER & ROUTING SECTION -->
    <line x1="15" y1="230" x2="785" y2="230" stroke="#000000" stroke-width="2"/>
    <g transform="translate(35, 175)">
      <text x="0" y="0" font-size="10" font-weight="800" fill="#666666" text-transform="uppercase">FROM / EXPÉDITEUR:</text>
      <text x="0" y="16" font-size="13" font-weight="700" fill="#000000">${escapeXml(sfName)}</text>
      <text x="0" y="32" font-size="11" font-weight="500" fill="#000000">${escapeXml(sfAddr1)}${sfAddr2 ? ` · ${escapeXml(sfAddr2)}` : ''}</text>
      <text x="0" y="47" font-size="11" font-weight="600" fill="#000000">${escapeXml(sfCity)}, ${escapeXml(sfProv)} ${escapeXml(sfZip)} CANADA · ${escapeXml(sfPhone)}</text>
    </g>

    <!-- 2D DataMatrix Simulation Block -->
    <g transform="translate(670, 170)">
      <rect x="0" y="0" width="50" height="50" fill="#000000"/>
      <rect x="6" y="6" width="38" height="38" fill="#ffffff"/>
      <rect x="12" y="12" width="26" height="26" fill="#000000"/>
      <rect x="18" y="18" width="14" height="14" fill="#ffffff"/>
      <rect x="22" y="22" width="6" height="6" fill="#000000"/>
    </g>

    <!-- RECIPIENT (SHIP TO) LARGE BLOCK -->
    <rect x="25" y="240" width="750" height="240" fill="#f8f9fa" stroke="#000000" stroke-width="2"/>
    <g transform="translate(50, 275)">
      <text x="0" y="0" font-size="12" font-weight="900" fill="#D82A2A" letter-spacing="1">SHIP TO / LIVRER À:</text>
      <text x="0" y="32" font-size="24" font-weight="900" fill="#000000">${escapeXml(stName.toUpperCase())}</text>
      ${stCompany ? `<text x="0" y="58" font-size="15" font-weight="700" fill="#333333">${escapeXml(stCompany.toUpperCase())}</text>` : ''}
      <text x="0" y="${stCompany ? 84 : 68}" font-size="20" font-weight="800" fill="#000000">${escapeXml(stAddr1.toUpperCase())}</text>
      ${stAddr2 ? `<text x="0" y="${stCompany ? 110 : 94}" font-size="18" font-weight="700" fill="#000000">${escapeXml(stAddr2.toUpperCase())}</text>` : ''}
      <text x="0" y="${stCompany ? (stAddr2 ? 140 : 118) : (stAddr2 ? 124 : 102)}" font-size="22" font-weight="900" fill="#000000">${escapeXml(stCity.toUpperCase())} ${escapeXml(stState.toUpperCase())}  ${escapeXml(stZip.toUpperCase())}</text>
      <text x="0" y="${stCompany ? (stAddr2 ? 172 : 150) : (stAddr2 ? 156 : 134)}" font-size="18" font-weight="900" fill="#000000">${escapeXml(stCountry === 'CA' ? 'CANADA' : (stCountry === 'US' ? 'UNITED STATES (USA)' : stCountry))}${stPhone ? ` · TEL: ${escapeXml(stPhone)}` : ''}</text>
    </g>

    <!-- POSTAL CODE HIGHLIGHT CHIP -->
    <rect x="580" y="375" width="180" height="90" fill="#000000" rx="4"/>
    <text x="670" y="405" font-size="11" font-weight="800" fill="#ffffff" text-anchor="middle">POSTAL / ZIP</text>
    <text x="670" y="445" font-size="26" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">${escapeXml(stZip.toUpperCase())}</text>

    <!-- PARCEL SPECS & ORDER REFERENCE STRIP -->
    <line x1="15" y1="495" x2="785" y2="495" stroke="#000000" stroke-width="2"/>
    <g transform="translate(40, 525)">
      <text x="0" y="0" font-size="12" font-weight="700" fill="#333333">WEIGHT: <tspan font-weight="900" fill="#000000">${weightKg} kg (${weightLb} lbs)</tspan></text>
      <text x="260" y="0" font-size="12" font-weight="700" fill="#333333">DIMS: <tspan font-weight="900" fill="#000000">${lengthCm} × ${widthCm} × ${heightCm} cm</tspan></text>
      <text x="520" y="0" font-size="12" font-weight="700" fill="#333333">REF: <tspan font-weight="900" fill="#000000">${escapeXml(orderNum || 'BOOK-ORDER')}</tspan></text>
    </g>
    <line x1="15" y1="545" x2="785" y2="545" stroke="#000000" stroke-width="2"/>

    <!-- MAIN TRACKING BARCODE -->
    <g id="cp-barcode-group">
      ${barcodeBars}
    </g>

    <!-- TRACKING PIN NUMBER DISPLAY -->
    <text x="400" y="730" font-size="22" font-weight="900" fill="#000000" text-anchor="middle" letter-spacing="3">${formattedPin}</text>
    <text x="400" y="750" font-size="11" font-weight="700" fill="#666666" text-anchor="middle">CANADA POST TRACKING PIN / N° DE SUIVI</text>

    <line x1="15" y1="770" x2="785" y2="770" stroke="#000000" stroke-width="3"/>

    <!-- CUSTOMS & US ZONOS DUTY PREPAYMENT SECTION (If Applicable) -->
    ${isCrossBorder ? `
      <rect x="25" y="785" width="750" height="375" fill="#fcfcfd" stroke="#000000" stroke-width="2"/>
      <g transform="translate(45, 815)">
        <rect x="-10" y="-20" width="730" height="35" fill="#2d3748"/>
        <text x="355" y="3" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">CUSTOMS DECLARATION / DÉCLARATION EN DOUANE — CN22</text>
        
        <text x="0" y="45" font-size="12" font-weight="700" fill="#000000">CONTENTS: <tspan font-weight="800">${escapeXml(customs?.description || 'Printed Books / Livres imprimés')}</tspan></text>
        <text x="420" y="45" font-size="12" font-weight="700" fill="#000000">TARIFF HS: <tspan font-weight="900">${escapeXml(customs?.hsCode || '490199')}</tspan></text>
        
        <text x="0" y="75" font-size="12" font-weight="700" fill="#000000">QTY: <tspan font-weight="800">${customs?.quantity || 1}</tspan> · VALUE: <tspan font-weight="900">$${parseFloat(customs?.declaredValue || 25).toFixed(2)} CAD</tspan></text>
        <text x="420" y="75" font-size="12" font-weight="700" fill="#000000">ORIGIN: <tspan font-weight="800">CANADA (CA)</tspan></text>
        
        ${declarationId ? `
          <rect x="0" y="100" width="710" height="65" fill="#e6fffa" stroke="#319795" stroke-width="2" rx="4"/>
          <text x="20" y="125" font-size="11" font-weight="900" fill="#234e52" letter-spacing="0.5">🇺🇸 US DUTIES &amp; TAXES PREPAID (DDP MANDATE)</text>
          <text x="20" y="148" font-size="14" font-weight="900" fill="#1d4044">ZONOS DECLARATION ID: <tspan fill="#285e61" font-family="'DM Mono', monospace">${escapeXml(declarationId)}</tspan></text>
        ` : ''}

        <text x="0" y="${declarationId ? 195 : 130}" font-size="10" font-weight="600" fill="#4a5568">I certify that the particulars given in this declaration are correct and that this item does not contain any dangerous articles.</text>
        <text x="0" y="${declarationId ? 215 : 150}" font-size="11" font-weight="700" fill="#000000">Signer: ${escapeXml(sfName)} · Date: ${todayDate}</text>
      </g>
    ` : `
      <g transform="translate(45, 820)">
        <rect x="0" y="0" width="710" height="330" fill="#f7fafc" stroke="#e2e8f0" stroke-width="2" rx="4"/>
        <text x="355" y="80" font-size="16" font-weight="800" fill="#2d3748" text-anchor="middle">DOMESTIC CANADIAN SHIPMENT</text>
        <text x="355" y="110" font-size="13" font-weight="600" fill="#718096" text-anchor="middle">Official Canada Post barcoded delivery standard</text>
        <text x="355" y="160" font-size="12" font-weight="700" fill="#4a5568" text-anchor="middle">Drop off at any Canada Post outlet or red street letter box</text>
        <g transform="translate(255, 200)">
          <rect x="0" y="0" width="200" height="40" fill="#D82A2A" rx="4"/>
          <text x="100" y="25" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle">POSTES CANADA</text>
        </g>
      </g>
    `}

    <!-- Drawn last so it survives on top of every block above, including in
         print. Non-interactive and translucent enough to leave the sheet
         readable while making its status impossible to miss. -->
    <g opacity="0.16" transform="rotate(-32 400 600)" style="pointer-events:none;">
      <text x="400" y="560" font-size="86" font-weight="900" fill="#B00020" text-anchor="middle" letter-spacing="4">REFERENCE COPY</text>
      <text x="400" y="650" font-size="58" font-weight="900" fill="#B00020" text-anchor="middle" letter-spacing="3">NOT FOR MAILING</text>
    </g>
  </svg>`;
}

/**
 * Generate a Blob from SVG string suitable for printing or downloading
 */
export function generateClientCanadaPostLabelBlob(shipmentDetails) {
  const svgText = generateCanadaPostLabelSvg(shipmentDetails);
  return new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
}

export const CANADAPOST_OAUTH_HOSTS = ['api.canadapost-postescanada.ca'];

export function resolveCanadaPostAuthStrategy(endpoint, { authType = '' } = {}) {
  const explicit = String(authType || '').toLowerCase().trim();
  if (explicit === 'oauth' || explicit === 'basic') return explicit;

  let host = '';
  try {
    host = new URL(String(endpoint || '')).hostname.toLowerCase();
  } catch (_) {
    host = '';
  }
  return CANADAPOST_OAUTH_HOSTS.some(h => host === h || host.endsWith('.' + h)) ? 'oauth' : 'basic';
}

/**
 * Turn a Canada Post HTTP status (plus whatever body came back with it) into a
 * sentence the publisher can act on. Canada Post answers a rejected credential
 * with a bare 401 and an empty or HTML body, so without this the old code
 * reported "Empty response from Canada Post Rating API" for what is really
 * "your key was refused" — sending the owner off to debug the wrong thing.
 */
export function describeCanadaPostFailure({ status = 0, body = '', endpoint = '', isTest = false } = {}) {
  const text = String(body || '');
  const codeMatch = text.match(/<code>([^<]+)<\/code>/);
  const descMatch = text.match(/<description>([^<]+)<\/description>/);
  if (codeMatch || descMatch) {
    return `Canada Post [${codeMatch ? codeMatch[1] : status || 'ERROR'}]: ${descMatch ? descMatch[1] : 'request rejected'}`;
  }

  const where = isTest ? 'the sandbox gateway (api.canadapost-postescanada.ca)' : 'the live gateway (api.canadapost-postescanada.ca)';
  if (status === 401) {
    return `Canada Post rejected these credentials (HTTP 401) at ${where}. ` +
      'Check that the Client ID and Client Secret are the pair issued by the new Canada Post Developer Portal, ' +
      'and that the Sandbox Environment toggle matches the kind of key you pasted.';
  }
  if (status === 403) {
    return `Canada Post accepted the credentials but refused this request (HTTP 403) at ${where}. ` +
      'The account is usually missing the Rating / Shipping entitlement, or the customer number does not belong to it.';
  }
  if (status === 404) {
    return `Canada Post has no endpoint at ${endpoint || where} (HTTP 404).`;
  }
  if (status === 429) {
    return 'Canada Post is rate-limiting this account (HTTP 429). Wait a moment and try again.';
  }
  if (status === 504) {
    // 503 genuinely announces an unavailable service, but 504 is a gateway
    // timeout — and a gateway that cannot route a request (a media type it does
    // not recognise, say) times out exactly like a service that is down. Calling
    // it an outage was a guess, and a wrong one sends the publisher off to wait
    // for a recovery that is not coming.
    return 'Canada Post\'s gateway did not answer in time (HTTP 504). ' +
      'That is usually temporary and worth retrying in a minute. If every attempt times out, ' +
      'the request is more likely being refused than the service being down.';
  }
  if (status >= 500) {
    return `Canada Post's own gateway returned HTTP ${status}. This is an outage on their side, not a problem with your key.`;
  }
  if (status) {
    return `Canada Post returned HTTP ${status}${text ? `: ${text.slice(0, 300)}` : ''}`;
  }
  return 'Canada Post returned an empty response.';
}

/** True when a proxy response body actually came from one of our proxies. */
function isProxyEnvelope(json) {
  return !!json && typeof json === 'object' &&
    ('json' in json || 'xml' in json || 'error' in json || 'rates' in json || 'base64' in json || 'status' in json);
}

/**
 * Read a proxy response and say what kind of answer it was.
 *
 * The distinction matters per hop. A static host answers /api/... with a 404
 * HTML page, which simply means "no local proxy here, keep walking". The same
 * reply from the Google Apps Script webhook means something is wrong with the
 * deployment, and reporting it as "no proxy here" sends the publisher off to
 * reconnect a sheet that is already connected.
 */
async function readProxyResponse(resp) {
  let text = '';
  try {
    text = await resp.text();
  } catch (_) {
    return { kind: 'unreadable', status: resp.status };
  }

  const trimmed = String(text || '').trim();
  if (!trimmed) return { kind: 'empty', status: resp.status, body: '' };

  let json = null;
  try {
    json = JSON.parse(trimmed);
  } catch (_) {
    return { kind: 'not-json', status: resp.status, body: trimmed };
  }

  if (!isProxyEnvelope(json)) {
    return { kind: 'not-envelope', status: resp.status, json, body: trimmed };
  }
  return { kind: 'envelope', status: resp.status, json };
}

/**
 * Explain a Google Apps Script webhook that answered with something other than
 * one of our envelopes. Apps Script serves a sign-in page, an error page or a
 * redirect as HTML, so the body itself says which of the usual deployment
 * mistakes it is.
 */
export function describeAppsScriptProxyFailure(result = {}) {
  const body = String(result.body || '');
  const looksHtml = /^\s*<(?:!doctype|html|head|body)/i.test(body) || /<\/html>/i.test(body);

  if (/sign in|accounts\.google\.com|AccountChooser|ServiceLogin/i.test(body)) {
    return 'Your Google Sheet connection answered with a Google sign-in page instead of data. ' +
      'The Apps Script deployment is set to require sign-in. Redeploy it with "Who has access" set to ' +
      '"Anyone", then try again.';
  }
  if (/authoriz|permission|access denied/i.test(body) && looksHtml) {
    return 'Your Google Sheet connection answered with an authorization page instead of data. ' +
      'Open the Apps Script project, run any function once to grant permissions, then redeploy it ' +
      'with "Who has access" set to "Anyone".';
  }
  if (/script function not found|TypeError|ReferenceError|Exception/i.test(body)) {
    return 'Your Google Sheet script hit an error while handling the request. ' +
      'It is probably running an older version — open Settings, copy the latest script, and redeploy it.';
  }
  if (looksHtml || result.kind === 'not-json') {
    return 'Your Google Sheet connection answered with a web page instead of data. ' +
      'That usually means the deployment is out of date, was removed, or the saved address points at a ' +
      '/dev URL rather than the /exec one. Open Settings, copy the latest script, redeploy it, and paste ' +
      'the new web app URL.';
  }
  if (result.kind === 'empty') {
    return 'Your Google Sheet connection answered with an empty response. ' +
      'Open Settings, copy the latest script, and redeploy it.';
  }
  return 'Your Google Sheet connection answered with an unexpected response. ' +
    'Open Settings, copy the latest script, and redeploy it.';
}

/**
 * A proxy answered. Decide whether it carries a usable payload or a failure
 * worth reporting; throw for the latter so the real cause reaches the screen.
 */
function unwrapProxyEnvelope(json, { endpoint = '', isTest = false } = {}) {
  if (json.error) throw new Error(String(json.error));

  const status = Number(json.status || 0);
  const failed = json.ok === false || (status >= 400);
  if (failed) {
    throw new Error(describeCanadaPostFailure({ status, body: typeof json.json === 'string' ? json.json : (json.xml || JSON.stringify(json.json || {})), endpoint, isTest }));
  }
  return json;
}

/**
 * Distinguish "this hop isn't available" (offline, CORS, aborted probe) from
 * "Canada Post gave a real answer and it was a failure". Only the first is
 * worth falling through to the next hop for.
 */
function isDefinitiveProxyError(err) {
  const msg = String((err && err.message) || err || '');
  if (!msg) return false;
  if (err && err.name === 'AbortError') return false;
  return !/Failed to fetch|NetworkError|network error|load failed|aborted|ECONNREFUSED|fetch failed/i.test(msg);
}

/** Abort a proxy probe that never answers, so a hung host can't freeze the UI. */
function withTimeout(ms) {
  try {
    if (typeof AbortController === 'undefined') return { signal: undefined, done: () => {} };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, done: () => clearTimeout(timer) };
  } catch (_) {
    return { signal: undefined, done: () => {} };
  }
}

export async function executeCanadaPostProxy({
  targetEndpoint,
  jsonPayload,
  apiKey = DEFAULT_CP_API_KEY,
  apiSecret = DEFAULT_CP_API_SECRET,
  customerNumber = DEFAULT_CP_CUSTOMER_NUMBER,
  zonosAccountKey = '',
  isTest = false,
  allowSimulation = null,
  scope = '',
  isShipment: isShipmentCall = null
}) {
  const key = sanitizeCanadaPostCredential(apiKey || DEFAULT_CP_API_KEY).value;
  const secret = sanitizeCanadaPostCredential(apiSecret || DEFAULT_CP_API_SECRET).value;
  // Which kind of call this is decides the backend route, the media type and
  // whether a failure may fall back to a test shipment — so the caller states
  // it. It used to be sniffed out of the URL with indexOf('ncshipment'), which
  // silently stops being true the moment the shipment path is corrected.
  const isShipment = isShipmentCall === null
    ? targetEndpoint.indexOf('ncshipment') !== -1
    : !!isShipmentCall;
  const localProxyUrl = isShipment ? '/api/canadapost/shipment' : '/api/canadapost/rates';

  // 1. Try local dev / backend proxy first if running in browser.
  // The body is read whatever the status code is: the backend mirrors Canada
  // Post's own status, so treating a 401 as "no proxy here" (the old
  // `if (proxyResp.ok)` guard) threw away the one answer that explains the
  // failure and left the publisher staring at a generic parse error.
  if (typeof window !== 'undefined') {
    const probe = withTimeout(8000);
    try {
      const proxyResp = await fetch(localProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonPayload,
          isTest,
          apiKey: key,
          apiSecret: secret,
          targetEndpoint,
          customerNumber,
          zonosAccountKey,
          scope
        }),
        signal: probe.signal
      });
      const local = await readProxyResponse(proxyResp);
      if (local.kind === 'envelope') {
        const data = local.json;
        unwrapProxyEnvelope(data, { endpoint: targetEndpoint, isTest });
        if (data.rates && Array.isArray(data.rates)) return { ok: true, rates: data.rates };
        if (data.trackingPin && data.labelUrl) return { ok: true, ...data };
        if (data.json) return { ok: true, json: data.json };
        if (data.xml) return { ok: true, json: data.xml };
      }
      // Anything else here means there is no local backend (a static host
      // answers this path with its own 404 page), so keep walking the chain.
    } catch (localErr) {
      // A real answer from the proxy (bad credentials, Canada Post outage) is
      // the end of the road — retrying the same request through another hop
      // only produces the same rejection with a worse error message.
      if (isDefinitiveProxyError(localErr)) throw localErr;
    } finally {
      probe.done();
    }
  }

  // 2. Try Google Apps Script proxy (bypasses browser CORS on GitHub Pages)
  const sheetsUrl = getSavedSheetsUrl();
  if (sheetsUrl && !sheetsUrl.includes('mock-test')) {
    try {
      const gasResp = await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          version: 2,
          action: 'proxycanadapost',
          payload: {
            endpoint: targetEndpoint,
            jsonPayload,
            apiKey: key,
            apiSecret: secret,
            customerNumber,
            zonosAccountKey,
            isTest,
            scope
          }
        })
      });
      const relay = await readProxyResponse(gasResp);
      if (relay.kind === 'envelope') {
        const json = relay.json;
        unwrapProxyEnvelope(json, { endpoint: targetEndpoint, isTest });
        if (json.json) return { ok: true, json: json.json };
        if (json.xml) return { ok: true, json: json.xml };
      }
      // The sheet answered, but not with a proxy envelope. Falling through to
      // a direct browser fetch here can only produce a CORS error, which reads
      // as "connect your Google Sheet" — advice that is wrong when a sheet is
      // connected and is the thing actually failing. Report it instead.
      throw new Error(describeAppsScriptProxyFailure(relay));
    } catch (gasErr) {
      if (isDefinitiveProxyError(gasErr)) throw gasErr;
    }
  }

  // 3. Direct fetch to Canada Post Gateway (handles serverless or browser CORS fallback)
  try {
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Accept-language': 'en-CA'
    };
    if (zonosAccountKey && zonosAccountKey.trim()) {
      headers['X-CPC-Zonos-Key'] = zonosAccountKey.trim();
    }
    
    // We cannot reliably fetch an OAuth token in the browser directly without CORS issues on the token endpoint too.
    // The direct fetch here is mostly a fallback. In the modern API, we'll request a token first if we can,
    // but the backend proxy is the primary way.
    // For direct fetch, we'd need an already retrieved token. Assuming direct fetch will fail gracefully due to CORS.

    const resp = await fetch(targetEndpoint, {
      method: 'POST',
      headers,
      body: jsonPayload
    });

    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(describeCanadaPostFailure({
        status: resp.status,
        body: text,
        endpoint: targetEndpoint,
        isTest
      }));
    }
    return { ok: true, json: text };
  } catch (directErr) {
    // A status Canada Post actually returned is a real answer, not an
    // unreachable gateway: report it instead of simulating over it.
    if (isDefinitiveProxyError(directErr)) throw directErr;

    // Browser CORS rejection or offline network disconnect.
    // A simulated shipment produces a tracking PIN that does not exist at Canada Post.
    // Handing that to a customer, billing it to the ledger, or marking an order shipped
    // would all be wrong, so simulation is confined to sandbox/demo-credential runs.
    if (isShipment && (allowSimulation === null ? isSimulationAllowed({ isTest }) : !!allowSimulation)) {
      return simulateCanadaPostShipment(directErr.message || 'Canada Post gateway unreachable');
    }
    if (isShipment) {
      throw new Error(
        `Canada Post could not be reached, so no label was purchased and no shipment was created (${directErr.message}). ` +
        'Check your connection, or run the local backend / Google Apps Script proxy, then try again.'
      );
    }
    const isCors = /Failed to fetch|NetworkError|CORS|cross-origin/i.test(directErr.message || '');
    if (isCors) {
      // Only advise connecting a sheet when there genuinely is not one. With a
      // sheet configured, reaching this point means the relay itself failed,
      // and telling the publisher to connect what is already connected is what
      // makes this error so hard to act on.
      throw new Error(
        sheetsUrl
          ? 'Canada Post connection: the request could not be routed through your Google Sheet, and Canada Post does not accept direct browser requests. ' +
            'Open Settings, copy the latest script, and redeploy your Google Sheet web app with "Who has access" set to "Anyone".'
          : 'Canada Post connection: Browser CORS restriction. Canada Post Web Services does not allow direct browser requests. ' +
            'Please ensure your Google Sheet is connected in the Settings tab (or run the local backend proxy) so requests can be securely routed.'
      );
    }
    throw new Error(`Canada Post connection: ${directErr.message}`);
  }
}

/**
 * Fetch live rates directly from Canada Post or via proxy
 */
export async function getCanadaPostRates({
  originPostalCode = 'M4B1B3',
  destCountry = 'CA',
  destPostalOrZip = '',
  weightKg = 0.5,
  lengthCm = 20,
  widthCm = 15,
  heightCm = 2,
  apiKey = DEFAULT_CP_API_KEY,
  apiSecret = DEFAULT_CP_API_SECRET,
  customerNumber = DEFAULT_CP_CUSTOMER_NUMBER,
  contractId = '',
  quoteType = 'auto',
  isTest = false
}) {
  const baseUrl = isTest ? CANADAPOST_SANDBOX_URL : CANADAPOST_PRODUCTION_URL;
  const targetEndpoint = `${baseUrl}${CANADAPOST_RATING_API.pricesPath}`;

  const quoteOnce = async (type) => {
    const jsonPayload = buildRateScenarioJson({
      originPostalCode,
      destCountry,
      destPostalOrZip,
      weightKg,
      lengthCm,
      widthCm,
      heightCm,
      customerNumber,
      contractId,
      quoteType: type
    });

    const result = await executeCanadaPostProxy({
      targetEndpoint,
      jsonPayload,
      apiKey,
      apiSecret,
      customerNumber,
      isTest
    });

    if (result.rates && Array.isArray(result.rates)) return result.rates;
    if (result.json) return parseCanadaPostPriceQuotes(result.json);
    throw new Error('Empty response from Canada Post Rating API');
  };

  // If quoteType is explicitly requested as 'counter' or 'retail', or if no customer number is provided:
  if (quoteType === 'counter' || quoteType === 'retail' || !String(customerNumber || '').trim()) {
    const retailQuotes = await quoteOnce('counter');
    return retailQuotes.map(q => ({ ...q, quoteType: 'counter', isRetail: true }));
  }

  // A commercial quote is the right first ask when there is a customer number:
  // it returns the account's negotiated prices. But Canada Post answers a
  // commercial request for an account with no contracted rates on that route with an
  // EMPTY list and HTTP 200 — no error, no explanation.
  //
  // When commercial comes back empty, ask again for the published retail
  // rates. Those require the customer number and contract id to be absent
  // entirely in the scenario payload.
  const wantsCommercial = !!String(customerNumber || '').trim();
  const first = await quoteOnce(wantsCommercial ? 'commercial' : 'counter');

  if (first.length > 0 || !wantsCommercial) {
    return first.map(q => ({ ...q, quoteType: wantsCommercial ? 'commercial' : 'counter' }));
  }

  const retail = await quoteOnce('counter');
  return retail.map(q => ({ ...q, quoteType: 'counter', isRetail: true, commercialUnavailable: true }));
}

/**
 * Characters that survive .trim() but corrupt a credential.
 *
 * Canada Post keys and passwords are plain ASCII. Copying one out of a PDF,
 * an email or the Developer Program portal can carry along a zero-width
 * space, a soft hyphen or a directional mark — invisible on screen, and
 * sitting inside the string rather than at its edges, so trimming does not
 * touch them. The gateway then sees a password that is not the one shown on
 * screen and answers E002, which reads exactly like a wrong password.
 */
const CP_INVISIBLE_CHARS = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
const CP_CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;

/**
 * Clean one credential and report what had to be removed, so a paste that
 * looked fine but was not can be named instead of guessed at.
 */
export function sanitizeCanadaPostCredential(value) {
  const raw = String(value == null ? '' : value);
  const stripped = raw.replace(CP_INVISIBLE_CHARS, '').replace(CP_CONTROL_CHARS, '');
  const clean = stripped.trim();

  const issues = [];
  if (stripped !== raw) issues.push('invisible');
  if (raw !== raw.trim()) issues.push('padded');
  if (/\s/.test(clean)) issues.push('internal-space');
  if (/[^\x20-\x7E]/.test(clean)) issues.push('non-ascii');

  return { value: clean, raw, issues, changed: clean !== raw };
}

/**
 * Canada Post runs two credential systems, and only one of them works here.
 *
 *  - Developer Program ("Web Services", what this app speaks): the key is
 *    issued as a single string of the form USERNAME:PASSWORD. The half before
 *    the colon is the username, the half after it is the password, and they
 *    are sent as HTTP Basic to soa-gw.canadapost.ca (or ct.soa-gw for the
 *    development key).
 *  - Developer Portal (newer): issues an OAuth 2.0 client ID and client
 *    secret — a single 32-character hex string with no colon — which are
 *    exchanged for a Bearer token and used against
 *    api.canadapost-postescanada.ca. They are NOT accepted by soa-gw under
 *    any authentication scheme.
 *
 * A portal client ID pasted into this card therefore fails with E002 forever,
 * and no toggle on the card can change that. Telling the two apart by shape is
 * the difference between "check your password again" (useless) and "you have
 * the wrong kind of key, here is how to get the right one".
 */
export function classifyCanadaPostKeyKind(apiKey = '') {
  const key = sanitizeCanadaPostCredential(apiKey).value;
  if (!key) return 'unknown';
  if (key.includes(':')) return 'legacy-combined';
  if (/^[0-9a-f]{32}$/i.test(key)) return 'portal-client-id';
  return 'legacy';
}

/**
 * Canada Post shows the Developer Program key as one "USERNAME:PASSWORD"
 * string, so pasting the whole thing into the key box is the natural mistake.
 * Split it rather than failing on it.
 */
export function splitCanadaPostApiKey(apiKey = '', apiSecret = '') {
  const key = sanitizeCanadaPostCredential(apiKey).value;
  const secret = sanitizeCanadaPostCredential(apiSecret).value;
  const idx = key.indexOf(':');
  if (idx <= 0) return { apiKey: key, apiSecret: secret, split: false };
  return {
    apiKey: key.slice(0, idx),
    apiSecret: key.slice(idx + 1) || secret,
    split: true
  };
}

/**
 * Look at a key and password before spending a network round trip on them.
 * Everything here is a shape problem the publisher can see and fix; none of
 * it can tell whether the account itself is valid.
 */
export function inspectCanadaPostCredentials({ apiKey = '', apiSecret = '', customerNumber = '' } = {}) {
  const key = sanitizeCanadaPostCredential(apiKey);
  const secret = sanitizeCanadaPostCredential(apiSecret);
  const findings = [];

  const describe = (label, result) => {
    if (result.issues.includes('invisible')) {
      findings.push(`Your ${label} contains hidden characters that do not show on screen — usually picked up when copying from a PDF or a web page. Retype it by hand, or copy it through a plain text editor.`);
    }
    if (result.issues.includes('internal-space')) {
      findings.push(`Your ${label} has a space inside it. Canada Post keys never contain spaces.`);
    }
    if (result.issues.includes('non-ascii')) {
      findings.push(`Your ${label} contains an unusual character, such as a curly quote or an accented letter. Canada Post keys are plain letters and numbers only.`);
    }
  };
  describe('API key', key);
  describe('API password', secret);

  const kind = classifyCanadaPostKeyKind(key.value);
  if (kind === 'legacy-combined') {
    findings.push('Your API key still has the password joined onto it. Canada Post shows the pair as "key:password" — the part before the colon goes in the key box, the part after it in the password box. (The Diagnose button splits it for you automatically.)');
  }
  if (kind === 'portal-client-id') {
    findings.push('This looks like a Client ID from the newer Canada Post Developer Portal, not a Developer Program API key. Canada Post runs two separate systems and this app uses the older one, which issues its key as two parts joined by a colon. A Developer Portal Client ID cannot sign in to it, which is why the password is refused no matter what else you change.');
  }
  if (key.value && secret.value && key.value === secret.value) {
    findings.push('The API key and the API password are identical. They are two different values from the Canada Post Developer Program.');
  }

  const custDigits = normalizeCustomerNumber(customerNumber);
  if (customerNumber && !isValidCustomerNumber(custDigits)) {
    findings.push(`The customer number should be 7 to 10 digits; this one is ${custDigits.length}.`);
  }

  return { apiKey: key, apiSecret: secret, customerNumber: custDigits, keyKind: kind, findings, ok: findings.length === 0 };
}

/** Canada Post's own wording for "these credentials were refused". */
export function isCanadaPostAuthFailure(message) {
  return /E002|AAA Authentication|Authentication Failure|HTTP 401|rejected these credentials/i.test(String(message || ''));
}

/**
 * Work out WHY Canada Post is refusing, rather than restating that it is.
 *
 * E002 covers a handful of distinct causes that look identical on the card,
 * and they are separable by experiment: a development key refused by the live
 * gateway is accepted by the sandbox one, and a customer number the key is not
 * entitled to fails only when that number is sent. So try the combinations,
 * cheapest first, and stop at the first that works.
 *
 * `probe` is injected so this is testable without a network.
 */
export async function diagnoseCanadaPostConnection({
  apiKey = '',
  apiSecret = '',
  customerNumber = '',
  contractId = '',
  isTest = false,
  probe = null
} = {}) {
  const inspection = inspectCanadaPostCredentials({ apiKey, apiSecret, customerNumber });
  // A key pasted whole as "username:password" is a paste mistake, not a bad
  // credential — split it and test what the publisher actually meant.
  const pair = splitCanadaPostApiKey(apiKey, apiSecret);
  const key = pair.apiKey;
  const secret = pair.apiSecret;
  const cust = inspection.customerNumber;
  const splitKeyKind = classifyCanadaPostKeyKind(key);

  if (splitKeyKind === 'legacy' || splitKeyKind === 'legacy-combined') {
    return {
      ok: false,
      verdict: 'wrong-key-system',
      headline: 'This legacy API key is no longer accepted by Canada Post.',
      steps: [
        'Canada Post retired its older "Developer Program" (which issued username:password keys joined by a colon) in April 2026.',
        'The new Developer Portal API strictly requires an OAuth 2.0 Client ID (a 32-character code without a colon).',
        'Sign in at https://developer-developpeur.canadapost-postescanada.ca/ to register a new App and get an OAuth Client ID and Secret.',
        'Paste the new Client ID into the key box and the Client Secret into the password box, then test again.'
      ],
      attempts: [],
      inspection,
      keySplit: pair.split
    };
  }

  if (!key || !secret) {
    return {
      ok: false,
      verdict: 'missing-credentials',
      headline: 'Add both an API key and an API password before testing.',
      steps: [],
      attempts: [],
      inspection
    };
  }

  const run = probe || (async ({ sandbox, withCustomer }) => getCanadaPostRates({
    originPostalCode: 'M4B1B3',
    destCountry: 'CA',
    destPostalOrZip: 'V6B2W9',
    weightKg: 0.5,
    apiKey: key,
    apiSecret: secret,
    customerNumber: withCustomer ? cust : '',
    contractId: withCustomer ? contractId : '',
    isTest: sandbox
  }));

  // Cheapest first: the configured environment, then the other one. The
  // customer number is only dropped after a plain attempt has already failed,
  // so a working configuration is never reported as a broken one.
  const plan = [
    { sandbox: !!isTest, withCustomer: !!cust },
    { sandbox: !isTest, withCustomer: !!cust }
  ];
  if (cust) {
    plan.push({ sandbox: !!isTest, withCustomer: false });
    plan.push({ sandbox: !isTest, withCustomer: false });
  }

  const attempts = [];
  let success = null;
  for (const step of plan) {
    if (attempts.some(a => a.sandbox === step.sandbox && a.withCustomer === step.withCustomer)) continue;
    try {
      const quotes = await run(step);
      const attempt = { ...step, ok: true, error: '', quoteCount: Array.isArray(quotes) ? quotes.length : 0 };
      attempts.push(attempt);
      success = attempt;
      break;
    } catch (err) {
      attempts.push({ ...step, ok: false, error: String((err && err.message) || err), quoteCount: 0 });
    }
  }

  return { ...classifyCanadaPostDiagnosis({ attempts, success, isTest, inspection }), attempts, inspection, keySplit: pair.split };
}

/** Turn the probe results into a verdict and a short list of next steps. */
export function classifyCanadaPostDiagnosis({ attempts = [], success = null, isTest = false, inspection = null } = {}) {
  const envName = (sandbox) => (sandbox ? 'the sandbox gateway' : 'the live gateway');

  if (success) {
    const matchesConfig = success.sandbox === !!isTest && (success.withCustomer || !inspection?.customerNumber);
    if (matchesConfig) {
      return {
        ok: true,
        verdict: 'working',
        headline: `Connected. Canada Post returned ${success.quoteCount} service${success.quoteCount === 1 ? '' : 's'}.`,
        steps: []
      };
    }
    const steps = [];
    if (success.sandbox !== !!isTest) {
      steps.push(success.sandbox
        ? 'Turn the Sandbox Environment toggle ON. This is a development key, and development keys only work against the sandbox gateway.'
        : 'Turn the Sandbox Environment toggle OFF. This is a production key, and production keys only work against the live gateway.');
    }
    if (!success.withCustomer && inspection?.customerNumber) {
      steps.push(`Clear the customer number (${inspection.customerNumber}). Canada Post accepts this key, but not with that customer number attached — it belongs to a different account, or this key has no contract pricing on it. Rates still work without it.`);
    }
    return {
      ok: false,
      verdict: 'wrong-settings',
      headline: `Your key and password are good. They work against ${envName(success.sandbox)}${success.withCustomer ? '' : ', without the customer number'} — not with the settings saved right now.`,
      steps
    };
  }

  const allAuth = attempts.length > 0 && attempts.every(a => isCanadaPostAuthFailure(a.error));
  if (allAuth) {
    return {
      ok: false,
      verdict: 'bad-credentials',
      headline: 'Canada Post refused this Client ID and Secret on both gateways, with and without the customer number.',
      steps: [
        'The keys themselves are the problem, so no combination of settings in this app will fix it.',
        'Sign in to the Canada Post Developer Portal and open your App credentials page, then copy the Client ID and Secret again from there.',
        'Make sure you are copying the Client Secret, not a general account password.',
        'A brand new production key can take up to a business day to activate, while the test key works immediately — if the account is new, try the test key with Sandbox Environment turned on.',
        'If the key is definitely correct and still refused, the account may not be subscribed to the Rating API. Check your App subscriptions in the portal.'
      ]
    };
  }

  const nonAuth = attempts.find(a => !isCanadaPostAuthFailure(a.error));
  if (nonAuth) {
    return {
      ok: false,
      verdict: 'other-failure',
      headline: 'The key and password were not the problem — the request failed for another reason.',
      steps: [nonAuth.error || 'Canada Post returned an unexpected response.']
    };
  }

  return {
    ok: false,
    verdict: 'unknown',
    headline: 'Canada Post could not be reached, so the key could not be checked.',
    steps: ['Check your internet connection, and that your Google Sheet is connected in Settings so requests can be routed.']
  };
}

/**
 * Lightweight ping test function to verify Canada Post credentials
 */
export async function testCanadaPostConnection({
  apiKey = DEFAULT_CP_API_KEY,
  apiSecret = DEFAULT_CP_API_SECRET,
  customerNumber = DEFAULT_CP_CUSTOMER_NUMBER,
  isTest = false
}) {
  if (!apiKey || !apiSecret) {
    throw new Error('API Key and Secret / Password are required');
  }

  const inspection = {
    keyKind: classifyCanadaPostKeyKind(apiKey),
    secretKind: classifyCanadaPostKeyKind(apiSecret),
    customerNumber
  };

  if (inspection.keyKind === 'legacy' || inspection.keyKind === 'legacy-combined') {
    return {
      ok: false,
      verdict: 'wrong-key-system',
      headline: 'This legacy API key is no longer accepted by Canada Post.',
      steps: [
        'Canada Post retired its older "Developer Program" (which issued username:password keys joined by a colon) in April 2026.',
        'The new Developer Portal API strictly requires an OAuth 2.0 Client ID (a 32-character code without a colon).',
        'Sign in at https://developer-developpeur.canadapost-postescanada.ca/ to register a new App and get an OAuth Client ID and Secret.',
        'Paste the new Client ID into the key box and the Client Secret into the password box, then test again.'
      ]
    };
  }

  // Test rating quote from Toronto to Vancouver
  const quotes = await getCanadaPostRates({
    originPostalCode: 'M4B1B3',
    destCountry: 'CA',
    destPostalOrZip: 'V6B2W9',
    weightKg: 0.5,
    lengthCm: 20,
    widthCm: 15,
    heightCm: 2,
    apiKey,
    apiSecret,
    customerNumber,
    isTest
  });

  return {
    ok: true,
    servicesCount: quotes.length,
    quotes
  };
}

/**
 * Parse a Canada Post tracking summary XML document.
 */
export function parseCanadaPostTrackingSummary(jsonText) {
  if (!jsonText || typeof jsonText !== 'string') {
    throw new Error('Empty response from Canada Post Tracking API');
  }

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Invalid JSON response from Canada Post Tracking API');
  }

  if (data.messages && data.messages.message) {
    const msg = Array.isArray(data.messages.message) ? data.messages.message[0] : data.messages.message;
    const code = msg.code || 'ERROR';
    const desc = msg.description || 'Tracking lookup failed';
    throw new Error(`Canada Post [${code}]: ${desc}`);
  }

  // Handle Developer Portal and legacy shapes (pins[0].summaries[0], pinSummaries.pinSummary, trackingSummary.pinSummary)
  const pinSummary = data.trackingSummary?.pinSummary ||
    (Array.isArray(data.pinSummaries?.pinSummary) ? data.pinSummaries.pinSummary[0] : data.pinSummaries?.pinSummary) ||
    (Array.isArray(data.pins) ? (data.pins[0]?.summaries?.[0] || data.pins[0]) : null) ||
    (Array.isArray(data.pinSummary) ? data.pinSummary[0] : data.pinSummary) ||
    data;

  const pin = pinSummary.pin || pinSummary.pinNumber || '';
  if (!pin) {
    throw new Error('Canada Post returned no tracking record for that PIN.');
  }

  return {
    ok: true,
    found: true,
    pin,
    originPostalId: pinSummary.originPostalId || pinSummary.originPostalCode || '',
    destinationPostalId: pinSummary.destinationPostalId || pinSummary.destinationPostalCode || '',
    destinationProvince: pinSummary.destinationProvince || '',
    serviceName: pinSummary.serviceName || pinSummary.serviceDescription || '',
    status: pinSummary.eventDescription || pinSummary.statusDescription || pinSummary.status || '',
    eventDateTime: pinSummary.eventDateTime || pinSummary.dateTime || '',
    eventLocation: pinSummary.eventLocation || pinSummary.location || '',
    expectedDeliveryDate: pinSummary.expectedDeliveryDate || pinSummary.deliveryDate || '',
    actualDeliveryDate: pinSummary.actualDeliveryDate || '',
    attemptedDate: pinSummary.attemptedDate || ''
  };
}

/**
 * Verify a tracking PIN exists at Canada Post, confirming a purchased label is real
 * and reached the merchant's account. Routes through the same proxy chain as the
 * other calls so it works from GitHub Pages as well as local dev.
 */
export async function verifyCanadaPostTrackingPin({
  pin,
  apiKey = DEFAULT_CP_API_KEY,
  apiSecret = DEFAULT_CP_API_SECRET,
  isTest = false
}) {
  const cleanPin = String(pin || '').replace(/[^0-9A-Za-z]/g, '');
  if (!cleanPin) throw new Error('A tracking PIN is required.');

  const key = sanitizeCanadaPostCredential(apiKey || DEFAULT_CP_API_KEY).value;
  const secret = sanitizeCanadaPostCredential(apiSecret || DEFAULT_CP_API_SECRET).value;
  if (!hasCanadaPostCredentials({ apiKey: key, apiSecret: secret })) {
    throw new Error('Add your Canada Post API key and secret in Tax Centre → Canada Post Direct API before checking a tracking PIN.');
  }
  const env = resolveCanadaPostEnvironment({ isTest });
  const targetEndpoint = `${env.baseUrl}${CANADAPOST_TRACKING_API.summaryPath.replace('{pin}', encodeURIComponent(cleanPin))}`;

  // 1. Local dev / backend proxy
  if (typeof window !== 'undefined') {
    const probe = withTimeout(8000);
    try {
      const proxyResp = await fetch(
        `/api/canadapost/track?pin=${encodeURIComponent(cleanPin)}&test=${env.isTest ? 'true' : 'false'}`,
        { headers: { 'x-cp-api-key': key, 'x-cp-api-secret': secret }, signal: probe.signal }
      );
      const local = await readProxyResponse(proxyResp);
      if (local.kind === 'envelope') {
        unwrapProxyEnvelope(local.json, { endpoint: targetEndpoint, isTest: env.isTest });
        const respText = typeof local.json.json === 'string' ? local.json.json : JSON.stringify(local.json.json || {});
        if (local.json.json || local.json.xml) return { ...parseCanadaPostTrackingSummary(respText || local.json.xml), environment: env };
      }
    } catch (localErr) {
      if (isDefinitiveProxyError(localErr)) throw localErr;
    } finally {
      probe.done();
    }
  }

  // 2. Google Apps Script proxy (bypasses browser CORS on GitHub Pages)
  const sheetsUrl = getSavedSheetsUrl();
  if (sheetsUrl && !sheetsUrl.includes('mock-test')) {
    try {
      const gasResp = await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          version: 2,
          action: 'proxycanadapost',
          payload: {
            endpoint: targetEndpoint,
            apiKey: key,
            apiSecret: secret,
            isTracking: true,
            isTest: env.isTest
          }
        })
      });
      const relay = await readProxyResponse(gasResp);
      if (relay.kind === 'envelope') {
        unwrapProxyEnvelope(relay.json, { endpoint: targetEndpoint, isTest: env.isTest });
        const respText = typeof relay.json.json === 'string' ? relay.json.json : JSON.stringify(relay.json.json || {});
        if (relay.json.json || relay.json.xml) return { ...parseCanadaPostTrackingSummary(respText || relay.json.xml), environment: env };
      }
      throw new Error(describeAppsScriptProxyFailure(relay));
    } catch (gasErr) {
      if (isDefinitiveProxyError(gasErr)) throw gasErr;
    }
  }

  // 3. Direct fetch (if bypassing local/AppsScript proxy or testing in Node)
  // For OAuth endpoints, 'executeCanadaPostProxy' natively routes requests and gets a Bearer token.
  // Direct fetch for tracking is mostly deprecated without an OAuth token generator in browser,
  // but if needed, we assume it's routed through proxy.
  // We'll set the Accept header to JSON just in case.
  const authHeader = 'Basic ' + btoa(`${key}:${secret}`);
  const resp = await fetch(targetEndpoint, {
    headers: {
      'Accept': 'application/json',
      'Authorization': authHeader,
      'Accept-language': 'en-CA'
    }
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(describeCanadaPostFailure({
      status: resp.status,
      body: text,
      endpoint: targetEndpoint,
      isTest: env.isTest
    }));
  }
  return { ...parseCanadaPostTrackingSummary(text), environment: env };
}

/**
 * Offline-first estimate of Canada Post rates when network is unavailable
 */
export function estimateOfflineCanadaPostRates({
  destCountry = 'CA',
  weightKg = 0.5,
  isCommercial = true
}) {
  const dest = String(destCountry || 'CA').toUpperCase().trim();
  const weight = Math.max(0.1, parseFloat(weightKg || 0.5));
  const discount = isCommercial ? 0.88 : 1.0; // ~12% Small Business discount

  if (dest === 'CA') {
    const base = Math.max(11.50, 11.50 + (weight - 0.5) * 3.50);
    return [
      {
        serviceCode: 'DOM.EP',
        serviceName: 'Expedited Parcel',
        totalPrice: Math.round(base * discount * 100) / 100,
        currency: 'CAD',
        estimatedSpeed: '1-4 business days'
      },
      {
        serviceCode: 'DOM.RP',
        serviceName: 'Regular Parcel',
        totalPrice: Math.round((base - 1.20) * discount * 100) / 100,
        currency: 'CAD',
        estimatedSpeed: '2-7 business days'
      },
      {
        serviceCode: 'DOM.XP',
        serviceName: 'Xpresspost',
        totalPrice: Math.round((base + 6.00) * discount * 100) / 100,
        currency: 'CAD',
        estimatedSpeed: '1-2 business days'
      }
    ];
  }

  if (dest === 'US') {
    const base = Math.max(14.00, 14.00 + (weight - 0.5) * 4.00);
    return [
      {
        serviceCode: 'USA.SP.AIR',
        serviceName: 'Small Packet - USA Air',
        totalPrice: Math.round((base - 4.00) * discount * 100) / 100,
        currency: 'CAD',
        estimatedSpeed: '5-8 business days'
      },
      {
        serviceCode: 'USA.TP',
        serviceName: 'Tracked Packet - USA',
        totalPrice: Math.round(base * discount * 100) / 100,
        currency: 'CAD',
        estimatedSpeed: '4-7 business days'
      },
      {
        serviceCode: 'USA.EP',
        serviceName: 'Expedited Parcel - USA',
        totalPrice: Math.round((base + 6.00) * discount * 100) / 100,
        currency: 'CAD',
        estimatedSpeed: '4-7 business days'
      },
      {
        serviceCode: 'USA.XP',
        serviceName: 'Xpresspost - USA',
        totalPrice: Math.round((base + 12.00) * discount * 100) / 100,
        currency: 'CAD',
        estimatedSpeed: '2-3 business days'
      }
    ];
  }

  // International
  const base = Math.max(22.00, 22.00 + (weight - 0.5) * 8.00);
  return [
    {
      serviceCode: 'INT.SP.AIR',
      serviceName: 'Small Packet - International Air',
      totalPrice: Math.round((base - 8.00) * discount * 100) / 100,
      currency: 'CAD',
      estimatedSpeed: '6-12 business days'
    },
    {
      serviceCode: 'INT.TP',
      serviceName: 'Tracked Packet - International',
      totalPrice: Math.round(base * discount * 100) / 100,
      currency: 'CAD',
      estimatedSpeed: '6-10 business days'
    },
    {
      serviceCode: 'INT.XP',
      serviceName: 'Xpresspost - International',
      totalPrice: Math.round((base + 24.00) * discount * 100) / 100,
      currency: 'CAD',
      estimatedSpeed: '4-7 business days'
    }
  ];
}

function escapeXml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalize a Zonos Declaration ID to its canonical form: 13 lowercase base36 characters.
 * Zonos issues these lowercase (e.g. 0rd4dpkrvc1y9); Canada Post forwards the value
 * verbatim, so the case must be preserved exactly as Zonos issued it.
 */
export function formatDeclarationId(declarationId) {
  if (!declarationId || typeof declarationId !== 'string') return '';
  return declarationId.toLowerCase().trim().replace(/[^a-z0-9]/g, '').slice(0, 13);
}

/**
 * Validate a 13-character Zonos Declaration ID. Accepts either case on input;
 * the canonical stored and transmitted form is lowercase base36.
 */
export function validateDeclarationId(declarationId) {
  if (!declarationId || typeof declarationId !== 'string') return false;
  return /^[a-z0-9]{13}$/.test(declarationId.trim().toLowerCase());
}

/**
 * Build JSON payload for creating a Non-Contract Shipment with Canada Post
 */
export function buildNonContractShipmentJson({
  serviceCode = 'DOM.EP',
  sender = {},
  destination = {},
  parcel = {},
  orderNum = '',
  customs = null,
  declarationId = '',
  // Stand-in sender details keep the screen usable while rehearsing without an
  // address saved. buyCanadaPostLabel refuses a live purchase before reaching
  // here, so in practice these only ever reach the sandbox.
  allowPlaceholders = true
}) {
  const weightKg = Number(Math.max(0.01, parseFloat(parcel.weightKg || 0.5)).toFixed(3));
  const lengthCm = Number(Math.max(0.1, parseFloat(parcel.lengthCm || 20)).toFixed(1));
  const widthCm = Number(Math.max(0.1, parseFloat(parcel.widthCm || 15)).toFixed(1));
  const heightCm = Number(Math.max(0.1, parseFloat(parcel.heightCm || 2)).toFixed(1));

  const ph = (value, stand) => (allowPlaceholders ? (value || stand) : (value || ''));
  const cleanOriginZip = ph(cleanPostalCode(sender.postalCode), 'M4B1B3');
  const destCountry = String(destination.countryCode || 'CA').toUpperCase().trim();
  const cleanDestZip = destCountry === 'CA' ? cleanPostalCode(destination.postalCode) : (destination.postalCode || destination.zip || '90210');

  const cleanDeclId = formatDeclarationId(declarationId || customs?.declarationId || '');

  const cleanSenderState = normalizeStateOrProvince(sender.province || sender.state || 'ON', 'CA') || 'ON';
  const cleanDestState = normalizeStateOrProvince(destination.province || destination.state || '', destCountry);

  const deliverySpec = {
    serviceCode: serviceCode,
    sender: {
      name: ph(sender.name, 'Lyricalmyrical Books'),
      company: sender.company || ph(sender.name, 'Lyricalmyrical Books'),
      contactPhone: ph(sender.phone, '4165550199'),
      addressDetails: {
        addressLine1: ph(sender.address1, '123 Main St'),
        city: ph(sender.city, 'Toronto'),
        provState: cleanSenderState,
        postalZipCode: cleanOriginZip
      }
    },
    destination: {
      name: destination.name || 'Customer',
      company: destination.company || '',
      addressDetails: {
        addressLine1: destination.address1 || '',
        city: destination.city || '',
        provState: cleanDestState,
        countryCode: destCountry,
        postalZipCode: cleanDestZip
      }
    },
    parcelCharacteristics: {
      weight: weightKg,
      dimensions: {
        length: lengthCm,
        width: widthCm,
        height: heightCm
      }
    },
    preferences: {
      showPackingInstructions: true,
      showPostageRate: true
    },
    references: {
      customerRef1: orderNum || 'BOOK-ORDER'
    }
  };

  // Canada Post treats an empty clientVoiceNumber as a malformed value rather
  // than an absent one, so the key is only added when there is a number to put
  // in it (or, while rehearsing, the stand-in).
  const destPhone = ph(destination.phone, '5555555555');
  if (destPhone) deliverySpec.destination.clientVoiceNumber = destPhone;

  if (sender.address2) deliverySpec.sender.addressDetails.addressLine2 = sender.address2;
  if (destination.address2) deliverySpec.destination.addressDetails.addressLine2 = destination.address2;

  if (destCountry !== 'CA' && (customs || cleanDeclId)) {
    const qty = Math.max(1, parseInt(customs?.quantity, 10) || 1);
    const declaredVal = Number(Math.max(1, parseFloat(customs?.declaredValue || 25)).toFixed(2));
    const customsDesc = String(customs?.description || 'Printed books').slice(0, 44);
    const hsCode = String(customs?.hsCode || '490199').replace(/[^0-9]/g, '').slice(0, 6) || '490199';
    
    deliverySpec.customs = {
      currency: "CAD",
      conversionFromCad: 1.0,
      reasonForExport: "SOG",
      skuList: {
        item: [
          {
            customsNumberOfUnits: qty,
            customsDescription: customsDesc,
            unitWeight: Number((weightKg / qty).toFixed(3)),
            customsValuePerUnit: Number((declaredVal / qty).toFixed(2)),
            hsTariffCode: hsCode,
            countryOfOrigin: "CA"
          }
        ]
      }
    };
    if (cleanDeclId) {
      deliverySpec.customs.declarationId = cleanDeclId;
    }
  }

  return JSON.stringify(deliverySpec);
}

/**
 * Parse Canada Post Non-Contract Shipment creation JSON response
 */
export function parseCanadaPostShipmentResponse(jsonText) {
  if (!jsonText || typeof jsonText !== 'string') {
    throw new Error('Empty response from Canada Post Shipment API');
  }

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Invalid JSON response from Canada Post Shipment API');
  }

  // Error check
  if (data.messages && data.messages.message) {
    const msg = Array.isArray(data.messages.message) ? data.messages.message[0] : data.messages.message;
    throw new Error(`Canada Post [${msg.code || 'ERROR'}]: ${msg.description || 'Shipment creation failed'}`);
  }
  if (data.code && data.description) {
    throw new Error(`Canada Post [${data.code}]: ${data.description}`);
  }
  if (data.fault && data.fault.faultstring) {
    throw new Error(`Canada Post [ERROR]: ${data.fault.faultstring}`);
  }

  const shipmentInfo = data.nonContractShipmentInfo || {};
  const shipmentId = shipmentInfo.shipmentId || '';
  const trackingPin = shipmentInfo.trackingPin || '';
  
  // Extract links for label artifact
  let labelLink = '';
  let receiptLink = '';
  
  const links = shipmentInfo.links?.link || [];
  const linkArray = Array.isArray(links) ? links : [links];
  for (const link of linkArray) {
    const rel = link['@rel'] || link.rel || '';
    const href = link['@href'] || link.href || '';
    if (rel === 'label') labelLink = href;
    if (rel === 'receipt') receiptLink = href;
  }

  // When a Zonos Verified Account key is sent on the request, Canada Post issues
  // the Declaration ID itself and returns it here rather than expecting one in.
  const rawDeclaration = shipmentInfo.declarationId || shipmentInfo.zonosDeclarationId || shipmentInfo.dutyDeclarationId || '';
  const declarationId = validateDeclarationId(rawDeclaration) ? formatDeclarationId(rawDeclaration) : '';

  return {
    ok: true,
    shipmentId,
    trackingPin,
    labelUrl: labelLink,
    receiptUrl: receiptLink,
    declarationId,
    ...parseShipmentPrice(shipmentInfo)
  };
}

/**
 * Read what Canada Post actually charged for a shipment.
 *
 * The request asks for showPostageRate, so the response carries the real price;
 * without reading it the ledger records the *quote* shown next to the button,
 * which drifts from the invoice whenever a surcharge, fuel adjustment or tax
 * difference applies. Returns an empty object when the block is absent, so the
 * caller can fall back to the quote knowingly rather than by accident.
 */
export function parseShipmentPrice(shipmentInfo = {}) {
  const price = shipmentInfo.shipmentPrice || shipmentInfo['shipment-price'] || null;
  if (!price || typeof price !== 'object') return {};

  const num = (...keys) => {
    for (const k of keys) {
      const raw = price[k];
      if (raw === undefined || raw === null || raw === '') continue;
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  const due = num('dueAmount', 'due-amount');
  const base = num('baseAmount', 'base-amount');
  // Only a positive charge is worth overriding the quote with; a zero or
  // missing due amount means Canada Post did not price this shipment here.
  if (!(due > 0)) return base > 0 ? { postageBase: base } : {};

  const taxes = ['gstAmount', 'gst-amount', 'pstAmount', 'pst-amount', 'hstAmount', 'hst-amount']
    .reduce((sum, k) => {
      const parsed = parseFloat(price[k]);
      return Number.isFinite(parsed) ? sum + parsed : sum;
    }, 0);

  return {
    postageCharged: Number(due.toFixed(2)),
    postageBase: base > 0 ? Number(base.toFixed(2)) : null,
    postageTaxes: Number(taxes.toFixed(2))
  };
}

/**
 * Buy a Canada Post shipping label and create the shipment
 */
export async function buyCanadaPostLabel({
  serviceCode = 'DOM.EP',
  sender = {},
  destination = {},
  parcel = {},
  orderNum = '',
  customs = null,
  declarationId = '',
  apiKey = DEFAULT_CP_API_KEY,
  apiSecret = DEFAULT_CP_API_SECRET,
  customerNumber = DEFAULT_CP_CUSTOMER_NUMBER,
  zonosAccountKey = '',
  isTest = false,
  // "Mailed on behalf of" — only set when Canada Post has given you a separate
  // number for it. One publisher mailing their own books leaves it blank and it
  // defaults to the billing customer number.
  mobo = ''
}) {
  const jsonPayload = buildNonContractShipmentJson({
    serviceCode,
    sender,
    destination,
    parcel,
    orderNum,
    customs,
    declarationId,
    allowPlaceholders: !!isTest
  });

  // Confirm the shipment will be billed to a real, correctly-formatted account before spending money.
  const audit = validateCanadaPostAccount({ apiKey, apiSecret, customerNumber, isTest });
  if (!audit.ok) {
    throw new Error(audit.errors.join(' '));
  }

  // The sender fields fall back to a worked example ("123 Main St, Toronto"),
  // which is fine while rehearsing the screen and quietly destructive once the
  // postage is real: an undeliverable parcel is returned to an address that does
  // not exist. So the substitution is confined to test mode, and a live purchase
  // is refused here — before the network call — rather than printed and posted.
  if (!isTest) {
    const missing = missingSenderFields(sender);
    if (missing.length) {
      throw new Error(
        `Your own ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing from the Sender panel. ` +
        'A live label needs a real return address, so no label was bought.'
      );
    }
    if (senderAddressIsPlaceholder(sender)) {
      throw new Error(
        'The return address is still the example one (123 Main St, Toronto). ' +
        'Put your real address in the Sender panel before buying a live label — nothing was bought.'
      );
    }
    // Canada Post requires a sender contact number. Without the stand-in this
    // would go out empty and come back as a schema error that reads like an
    // address fault, so name the real cause here instead.
    if (!String(sender.phone ?? '').trim()) {
      throw new Error(
        'Your phone number is missing from the Sender panel, and Canada Post needs a sender contact number ' +
        'on every shipment. No label was bought.'
      );
    }
  }

  const customerId = audit.customerNumber || normalizeCustomerNumber(DEFAULT_CP_CUSTOMER_NUMBER);

  // The endpoint comes from the registry rather than being built here. This
  // call used to post to `/rs/{customer}/ncshipment` — the retired Web Services
  // path — against the Developer Portal host, which has no such path, so every
  // purchase 404'd and a sandbox run silently fell through to a fake shipment.
  const targetEndpoint = resolveShipmentEndpoint({
    baseUrl: audit.environment.baseUrl,
    customerNumber: customerId,
    mobo
  });

  if (!targetEndpoint) {
    // Only reachable with no customer number, which the audit above already
    // reports; saying it again here beats posting to a half-built path.
    throw new Error(
      'Canada Post needs your customer number before it can create a shipment. No label was bought.'
    );
  }

  const result = await executeCanadaPostProxy({
    targetEndpoint,
    jsonPayload,
    apiKey,
    apiSecret,
    customerNumber,
    zonosAccountKey,
    isTest,
    scope: resolveCanadaPostScope(CANADAPOST_SHIPPING_API),
    product: resolveCanadaPostProduct(CANADAPOST_SHIPPING_API),
    isShipment: true
  });

  let responseData;
  if (result.trackingPin && result.labelUrl) {
    responseData = result;
  } else if (result.json) {
    // Read through the v8-tolerant parser first: it accepts the several
    // envelope and link shapes Canada Post has used, and reports a Canada Post
    // error as data rather than throwing, so the code can be classified.
    const shipment = parseShipmentResponse(result.json);
    if (!shipment.created) {
      // Fall back to the older parser purely for its error wording, which
      // surfaces Canada Post's own code and description.
      responseData = parseCanadaPostShipmentResponse(result.json);
    } else {
      responseData = {
        ...parseCanadaPostShipmentResponse(result.json),
        ...shipment
      };
    }
  } else {
    throw new Error('Empty response from Canada Post Shipment API');
  }

  const isSimulated = !!(result.isSimulated || responseData.isSimulated);

  // A Verified Account shipment comes back with the Declaration ID Canada Post
  // issued; otherwise the one we supplied (bought in the Prepay app) stands.
  const sentDeclarationId = formatDeclarationId(declarationId || customs?.declarationId || '');
  const issuedDeclarationId = formatDeclarationId(responseData.declarationId || '');
  const finalDeclarationId = issuedDeclarationId || sentDeclarationId;

  // Cache shipment context for instant high-res label reproduction
  setLastPurchasedShipmentContext({
    serviceCode,
    serviceName: CANADAPOST_SERVICES[serviceCode]?.name || 'Expedited Parcel',
    trackingPin: responseData.trackingPin,
    shipmentId: responseData.shipmentId,
    // Kept so a reprint days later can re-fetch the official Canada Post PDF
    // instead of falling straight through to the redrawn preview.
    labelUrl: responseData.labelUrl || '',
    receiptUrl: responseData.receiptUrl || '',
    postageCharged: responseData.postageCharged ?? null,
    orderNum,
    sender,
    destination,
    parcel,
    customs,
    declarationId: finalDeclarationId,
    customerNumber: customerId,
    // Kept on the archived shipment so a reprint days later still shows whether
    // this parcel was ever transmitted — the surcharge for an unmanifested
    // shipment lands long after the label is printed.
    manifestRequired: !!responseData.manifestRequired,
    isSimulated,
    mode: audit.environment.mode,
    purchasedAt: new Date().toISOString()
  });

  return {
    ...responseData,
    declarationId: finalDeclarationId,
    declarationIssuedByCarrier: !!issuedDeclarationId,
    manifestRequired: !!responseData.manifestRequired,
    // The single sentence the screen shows about what to do next. Built here so
    // the manifest step cannot be dropped by a caller that forgets to check a
    // boolean — the surcharge for skipping it is real money.
    nextStep: describeNextStep({
      created: !!(responseData.trackingPin || responseData.shipmentId),
      manifestRequired: !!responseData.manifestRequired
    }),
    isSimulated,
    simulationReason: result.simulationReason || '',
    mode: audit.environment.mode,
    environment: audit.environment,
    customerNumber: customerId,
    warnings: audit.warnings
  };
}

/**
 * Fetch the official Canada Post label artifact (a print-ready PDF).
 *
 * This is the label the post office accepts. The app also draws its own 4x6
 * preview, and for a long time that preview was the ONLY thing the shipping
 * screen ever showed or printed — this function existed but nothing called it,
 * so a publisher could buy real postage, print the redrawn sheet, and be turned
 * away at the counter. The two are kept apart deliberately here:
 *
 *   kind: 'pdf'  -> the real artifact, safe to print and mail
 *   kind: 'svg'  -> our own preview, NOT mailable, for reference/reprint only
 *
 * Callers must show that difference; `mailable` is on the result so it cannot
 * be missed. Returns null only when there is nothing at all to show.
 *
 * @returns {Promise<{blob: Blob, kind: 'pdf'|'svg', mailable: boolean, source: string, reason?: string}|null>}
 */
export async function fetchCanadaPostLabelArtifact({
  labelUrl,
  apiKey = DEFAULT_CP_API_KEY,
  apiSecret = DEFAULT_CP_API_SECRET,
  shipmentContext = null
}) {
  const key = sanitizeCanadaPostCredential(apiKey || DEFAULT_CP_API_KEY).value;
  const secret = sanitizeCanadaPostCredential(apiSecret || DEFAULT_CP_API_SECRET).value;
  const context = shipmentContext || getLastPurchasedShipmentContext();
  const url = String(labelUrl || context?.labelUrl || '');
  const preview = (reason) => {
    if (!context) return null;
    return { blob: generateClientCanadaPostLabelBlob(context), kind: 'svg', mailable: false, source: 'preview', reason };
  };

  // A simulated or placeholder shipment never had an artifact to fetch.
  const isRemote = /^https?:\/\//i.test(url);
  if (!isRemote) {
    return preview(url ? 'This shipment has no Canada Post label artifact.' : 'No label address was returned for this shipment.');
  }

  const attempts = [];

  // 1. Local dev / backend proxy. Credentials travel in headers only: a key in
  //    the query string is written verbatim into every access log it passes.
  if (typeof window !== 'undefined') {
    try {
      const proxyResp = await fetch(`/api/canadapost/artifact?url=${encodeURIComponent(url)}`, {
        headers: { 'x-cp-api-key': key, 'x-cp-api-secret': secret }
      });
      if (proxyResp.ok) {
        const contentType = proxyResp.headers?.get?.('content-type') || '';
        if (/pdf|octet-stream/i.test(contentType)) {
          return { blob: await proxyResp.blob(), kind: 'pdf', mailable: true, source: 'backend' };
        }
      }
      attempts.push(`local proxy returned ${proxyResp.status}`);
    } catch (err) {
      attempts.push(`local proxy unavailable (${err.message})`);
    }
  }

  // 2. Google Apps Script relay — the path that works on GitHub Pages, where
  //    there is no backend and Canada Post rejects direct browser requests.
  const sheetsUrl = getSavedSheetsUrl();
  if (sheetsUrl && !sheetsUrl.includes('mock-test')) {
    try {
      const gasResp = await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          version: 2,
          action: 'proxycanadapost',
          payload: { endpoint: url, apiKey: key, apiSecret: secret, isArtifact: true }
        })
      });
      if (gasResp.ok) {
        const json = await gasResp.json();
        if (json && json.base64) {
          const byteChars = atob(json.base64);
          const bytes = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
          return {
            blob: new Blob([bytes], { type: json.mime || 'application/pdf' }),
            kind: 'pdf',
            mailable: true,
            source: 'sheet'
          };
        }
        attempts.push(json?.error ? `Google Sheet relay: ${json.error}` : 'Google Sheet relay returned no label data');
      } else {
        attempts.push(`Google Sheet relay returned ${gasResp.status}`);
      }
    } catch (err) {
      attempts.push(`Google Sheet relay failed (${err.message})`);
    }
  } else {
    attempts.push('no Google Sheet connected to relay the download');
  }

  // 3. Direct fetch, for a serverless host that permits it.
  try {
    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/pdf',
        'Authorization': 'Basic ' + btoa(`${key}:${secret}`)
      }
    });
    if (resp.ok) return { blob: await resp.blob(), kind: 'pdf', mailable: true, source: 'direct' };
    attempts.push(`Canada Post returned ${resp.status}`);
  } catch (err) {
    attempts.push(`direct download blocked (${err.message})`);
  }

  return preview(attempts.join('; '));
}

/**
 * Backwards-compatible Blob-only wrapper around fetchCanadaPostLabelArtifact.
 * Prefer the artifact form: a caller that only gets a Blob back cannot tell the
 * official PDF from the preview, and printing the wrong one costs a trip to the
 * post office.
 */
export async function fetchCanadaPostLabelBlob({
  labelUrl,
  apiKey = DEFAULT_CP_API_KEY,
  apiSecret = DEFAULT_CP_API_SECRET,
  shipmentContext = null
}) {
  const artifact = await fetchCanadaPostLabelArtifact({ labelUrl, apiKey, apiSecret, shipmentContext });
  if (artifact) return artifact.blob;

  // Nothing stored and nothing fetchable: draw from the tracking number alone
  // so the screen has something to show rather than nothing.
  return generateClientCanadaPostLabelBlob({
    trackingPin: String(labelUrl || '').split('/').pop() || '',
    sender: { name: 'Lyricalmyrical Books' },
    destination: { name: 'Customer' }
  });
}
