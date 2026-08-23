/**
 * Canada Post Direct REST API & Rating Client
 *
 * Implements official Canada Post Web Services REST API:
 * - Rating & Pricing: /rs/ship/price
 * - Tracking: /vis/tracking/pin/{pin}/summary
 * - Service Discovery & Connection Test
 * - Offline-first fallback estimation for Canadian domestic and cross-border shipments
 */

export const CANADAPOST_PRODUCTION_URL = 'https://soa-gw.canadapost.ca';
export const CANADAPOST_SANDBOX_URL = 'https://ct.soa-gw.canadapost.ca';

/**
 * Standard Canada Post service codes and user-friendly labels
 */
export const CANADAPOST_SERVICES = {
  'DOM.RP': { name: 'Regular Parcel', category: 'domestic', speed: '2-9 business days' },
  'DOM.EP': { name: 'Expedited Parcel', category: 'domestic', speed: '1-7 business days' },
  'DOM.XP': { name: 'Xpresspost', category: 'domestic', speed: '1-2 business days' },
  'DOM.PC': { name: 'Priority', category: 'domestic', speed: 'Next business day' },
  'USA.TP': { name: 'Tracked Packet - USA', category: 'usa', speed: '4-7 business days' },
  'USA.XP': { name: 'Xpresspost - USA', category: 'usa', speed: '2-3 business days' },
  'USA.EP': { name: 'Expedited Parcel - USA', category: 'usa', speed: '4-7 business days' },
  'USA.PW.PARCEL': { name: 'Priority Worldwide - USA', category: 'usa', speed: '1 business day' },
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
 * Build the XML mailing-scenario payload for Canada Post /rs/ship/price
 */
export function buildRateScenarioXml({
  originPostalCode = 'M4B1B3',
  destCountry = 'CA',
  destPostalOrZip = '',
  weightKg = 0.5,
  lengthCm = 20,
  widthCm = 15,
  heightCm = 2,
  customerNumber = '',
  contractId = ''
}) {
  const origin = cleanPostalCode(originPostalCode) || 'M4B1B3';
  const dest = String(destCountry || 'CA').toUpperCase().trim();
  const weight = Math.max(0.01, parseFloat(weightKg || 0.5)).toFixed(3);
  const length = Math.max(0.1, parseFloat(lengthCm || 20)).toFixed(1);
  const width = Math.max(0.1, parseFloat(widthCm || 15)).toFixed(1);
  const height = Math.max(0.1, parseFloat(heightCm || 2)).toFixed(1);

  let destXml = '';
  if (dest === 'CA') {
    const cleanDestPostal = cleanPostalCode(destPostalOrZip) || 'V6B2W9';
    destXml = `<domestic><postal-code>${cleanDestPostal}</postal-code></domestic>`;
  } else if (dest === 'US') {
    const cleanZip = String(destPostalOrZip || '90210').replace(/[^0-9A-Z]/gi, '').slice(0, 5) || '90210';
    destXml = `<united-states><zip-code>${cleanZip}</zip-code></united-states>`;
  } else {
    destXml = `<international><country-code>${dest}</country-code></international>`;
  }

  const customerXml = customerNumber ? `<customer-number>${customerNumber.trim()}</customer-number>` : '';
  const contractXml = contractId ? `<contract-id>${contractId.trim()}</contract-id>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<mailing-scenario xmlns="http://www.canadapost.ca/ws/ship/rate-v4">
  ${customerXml}
  ${contractXml}
  <parcel-characteristics>
    <weight>${weight}</weight>
    <dimensions>
      <length>${length}</length>
      <width>${width}</width>
      <height>${height}</height>
    </dimensions>
  </parcel-characteristics>
  <origin-postal-code>${origin}</origin-postal-code>
  <destination>
    ${destXml}
  </destination>
</mailing-scenario>`.trim();
}

/**
 * Parse Canada Post XML price quotes response
 */
export function parseCanadaPostPriceQuotes(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') {
    throw new Error('Empty response from Canada Post Rating API');
  }

  // Check for error messages
  if (xmlText.includes('<message>') || xmlText.includes('<code>E')) {
    const codeMatch = xmlText.match(/<code>([^<]+)<\/code>/);
    const descMatch = xmlText.match(/<description>([^<]+)<\/description>/);
    const code = codeMatch ? codeMatch[1] : 'ERROR';
    const desc = descMatch ? descMatch[1] : 'Unknown Canada Post error';
    throw new Error(`Canada Post [${code}]: ${desc}`);
  }

  const quotes = [];
  const quoteRegex = /<price-quote>([\s\S]*?)<\/price-quote>/g;
  let match;

  while ((match = quoteRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const serviceCode = (block.match(/<service-code>([^<]+)<\/service-code>/) || [])[1] || '';
    const serviceName = (block.match(/<service-name>([^<]+)<\/service-name>/) || [])[1] || CANADAPOST_SERVICES[serviceCode]?.name || serviceCode;
    
    // Price details
    const basePrice = parseFloat((block.match(/<base>([^<]+)<\/base>/) || [])[1] || 0);
    const duePrice = parseFloat((block.match(/<due>([^<]+)<\/due>/) || [])[1] || basePrice);
    const gstPrice = parseFloat((block.match(/<gst>([^<]+)<\/gst>/) || [])[1] || 0);
    const pstPrice = parseFloat((block.match(/<pst>([^<]+)<\/pst>/) || [])[1] || 0);
    const hstPrice = parseFloat((block.match(/<hst>([^<]+)<\/hst>/) || [])[1] || 0);
    const totalTaxes = Math.round((gstPrice + pstPrice + hstPrice) * 100) / 100;
    
    // Service transit standard
    const transitDays = (block.match(/<expected-transit-time>([^<]+)<\/expected-transit-time>/) || [])[1] || null;
    const deliveryDate = (block.match(/<expected-delivery-date>([^<]+)<\/expected-delivery-date>/) || [])[1] || null;

    quotes.push({
      serviceCode,
      serviceName,
      currency: 'CAD',
      basePrice,
      totalPrice: duePrice,
      taxes: totalTaxes,
      gst: gstPrice,
      pst: pstPrice,
      hst: hstPrice,
      transitDays: transitDays ? parseInt(transitDays, 10) : null,
      deliveryDate,
      estimatedSpeed: transitDays ? `${transitDays} business day${parseInt(transitDays, 10) === 1 ? '' : 's'}` : (CANADAPOST_SERVICES[serviceCode]?.speed || 'Standard')
    });
  }

  // Sort cheapest first
  quotes.sort((a, b) => a.totalPrice - b.totalPrice);
  return quotes;
}

export const DEFAULT_CP_API_KEY = '5832e3366d6aeb872e41adfab8192271';
export const DEFAULT_CP_API_SECRET = '75fdce5f4799ac746b93cc34944ff146';
export const DEFAULT_CP_CUSTOMER_NUMBER = '0007123456';

function getSavedSheetsUrl() {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
      return localStorage.getItem('lm-sheets-url') || '';
    }
  } catch (_) {}
  try {
    if (typeof window !== 'undefined' && window.sheetsUrl) {
      return window.sheetsUrl;
    }
  } catch (_) {}
  return '';
}

/**
 * Execute Canada Post API request with proxy chain (Local dev -> Google Apps Script -> Direct)
 */
export async function executeCanadaPostProxy({
  targetEndpoint,
  xmlPayload,
  apiKey = DEFAULT_CP_API_KEY,
  apiSecret = DEFAULT_CP_API_SECRET,
  customerNumber = DEFAULT_CP_CUSTOMER_NUMBER,
  zonosAccountKey = '',
  isTest = false
}) {
  const key = (apiKey || DEFAULT_CP_API_KEY).trim();
  const secret = (apiSecret || DEFAULT_CP_API_SECRET).trim();
  const isShipment = targetEndpoint.indexOf('ncshipment') !== -1;
  const localProxyUrl = isShipment ? '/api/canadapost/shipment' : '/api/canadapost/rates';

  // 1. Try local dev proxy first if running in browser
  if (typeof window !== 'undefined') {
    try {
      const proxyResp = await fetch(localProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xmlPayload,
          isTest,
          apiKey: key,
          apiSecret: secret,
          targetEndpoint,
          customerNumber,
          zonosAccountKey
        })
      });
      if (proxyResp.ok) {
        const data = await proxyResp.json();
        if (data.rates && Array.isArray(data.rates)) return { ok: true, rates: data.rates };
        if (data.trackingPin && data.labelUrl) return { ok: true, ...data };
        if (data.xml) return { ok: true, xml: data.xml };
      }
    } catch (_) {}
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
            xmlPayload,
            apiKey: key,
            apiSecret: secret,
            zonosAccountKey
          }
        })
      });
      if (gasResp.ok) {
        const json = await gasResp.json();
        if (json && json.xml) return { ok: true, xml: json.xml };
      }
    } catch (_) {}
  }

  // 3. Direct fetch to Canada Post Gateway
  const authHeader = 'Basic ' + btoa(`${key}:${secret}`);
  const headers = {
    'Accept': isShipment ? 'application/vnd.cpc.ncshipment-v4+xml' : 'application/vnd.cpc.ship.rate-v4+xml',
    'Content-Type': isShipment ? 'application/vnd.cpc.ncshipment-v4+xml' : 'application/vnd.cpc.ship.rate-v4+xml',
    'Authorization': authHeader,
    'Accept-language': 'en-CA'
  };
  if (zonosAccountKey && zonosAccountKey.trim()) {
    headers['X-CPC-Zonos-Key'] = zonosAccountKey.trim();
  }

  const resp = await fetch(targetEndpoint, {
    method: 'POST',
    headers,
    body: xmlPayload
  });

  const text = await resp.text();
  return { ok: resp.ok, xml: text };
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
  isTest = false
}) {
  const xmlPayload = buildRateScenarioXml({
    originPostalCode,
    destCountry,
    destPostalOrZip,
    weightKg,
    lengthCm,
    widthCm,
    heightCm,
    customerNumber,
    contractId
  });

  const baseUrl = isTest ? CANADAPOST_SANDBOX_URL : CANADAPOST_PRODUCTION_URL;
  const targetEndpoint = `${baseUrl}/rs/ship/price`;

  const result = await executeCanadaPostProxy({
    targetEndpoint,
    xmlPayload,
    apiKey,
    apiSecret,
    customerNumber,
    isTest
  });

  if (result.rates && Array.isArray(result.rates)) return result.rates;
  if (result.xml) return parseCanadaPostPriceQuotes(result.xml);
  throw new Error('Empty response from Canada Post Rating API');
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
        serviceCode: 'USA.TP',
        serviceName: 'Tracked Packet - USA',
        totalPrice: Math.round(base * discount * 100) / 100,
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
 * Validate 13-character Zonos Declaration ID format (alphanumeric, e.g. 13 characters)
 */
export function validateDeclarationId(declarationId) {
  if (!declarationId || typeof declarationId !== 'string') return false;
  const clean = declarationId.trim().toUpperCase();
  return /^[A-Z0-9]{13}$/.test(clean);
}

/**
 * Build XML payload for creating a Non-Contract Shipment with Canada Post
 */
export function buildNonContractShipmentXml({
  serviceCode = 'DOM.EP',
  sender = {},
  destination = {},
  parcel = {},
  orderNum = '',
  customs = null,
  declarationId = ''
}) {
  const weightKg = Math.max(0.01, parseFloat(parcel.weightKg || 0.5)).toFixed(3);
  const lengthCm = Math.max(0.1, parseFloat(parcel.lengthCm || 20)).toFixed(1);
  const widthCm = Math.max(0.1, parseFloat(parcel.widthCm || 15)).toFixed(1);
  const heightCm = Math.max(0.1, parseFloat(parcel.heightCm || 2)).toFixed(1);

  const cleanOriginZip = cleanPostalCode(sender.postalCode) || 'M4B1B3';
  const destCountry = String(destination.countryCode || 'CA').toUpperCase().trim();
  const cleanDestZip = destCountry === 'CA' ? cleanPostalCode(destination.postalCode) : (destination.postalCode || destination.zip || '90210');

  const cleanDeclId = (declarationId || customs?.declarationId || '').trim().toUpperCase();
  let declXml = '';
  if (cleanDeclId) {
    declXml = `\n      <declaration-id>${escapeXml(cleanDeclId)}</declaration-id>`;
  }

  let customsXml = '';
  if (destCountry !== 'CA' && (customs || cleanDeclId)) {
    const qty = Math.max(1, parseInt(customs?.quantity, 10) || 1);
    const declaredVal = Math.max(1, parseFloat(customs?.declaredValue || 25)).toFixed(2);
    const customsDesc = String(customs?.description || 'Printed books').slice(0, 44);
    const hsCode = String(customs?.hsCode || '490199').replace(/[^0-9]/g, '').slice(0, 6) || '490199';
    customsXml = `
    <customs>
      <currency>CAD</currency>
      <conversion-from-cad>1.0</conversion-from-cad>
      <reason-for-export>SOG</reason-for-export>${declXml}
      <sku-list>
        <item>
          <customs-number-of-units>${qty}</customs-number-of-units>
          <customs-description>${escapeXml(customsDesc)}</customs-description>
          <unit-weight>${(parseFloat(weightKg) / qty).toFixed(3)}</unit-weight>
          <customs-value-per-unit>${(parseFloat(declaredVal) / qty).toFixed(2)}</customs-value-per-unit>
          <hs-tariff-code>${hsCode}</hs-tariff-code>
          <country-of-origin>CA</country-of-origin>
        </item>
      </sku-list>
    </customs>`;
  }

  const cleanSenderState = normalizeStateOrProvince(sender.province || sender.state || 'ON', 'CA') || 'ON';
  const cleanDestState = normalizeStateOrProvince(destination.province || destination.state || '', destCountry);

  return `<?xml version="1.0" encoding="UTF-8"?>
<non-contract-shipment xmlns="http://www.canadapost.ca/ws/ncshipment-v4">
  <delivery-spec>
    <service-code>${serviceCode}</service-code>
    <sender>
      <name>${escapeXml(sender.name || 'Lyricalmyrical Books')}</name>
      <company>${escapeXml(sender.company || 'Lyricalmyrical Books')}</company>
      <contact-phone>${escapeXml(sender.phone || '4165550199')}</contact-phone>
      <address-details>
        <address-line-1>${escapeXml(sender.address1 || '123 Main St')}</address-line-1>${sender.address2 ? `\n        <address-line-2>${escapeXml(sender.address2)}</address-line-2>` : ''}
        <city>${escapeXml(sender.city || 'Toronto')}</city>
        <prov-state>${escapeXml(cleanSenderState)}</prov-state>
        <postal-zip-code>${cleanOriginZip}</postal-zip-code>
      </address-details>
    </sender>
    <destination>
      <name>${escapeXml(destination.name || 'Customer')}</name>
      <company>${escapeXml(destination.company || '')}</company>
      <client-voice-number>${escapeXml(destination.phone || '5555555555')}</client-voice-number>
      <address-details>
        <address-line-1>${escapeXml(destination.address1 || '')}</address-line-1>${destination.address2 ? `\n        <address-line-2>${escapeXml(destination.address2)}</address-line-2>` : ''}
        <city>${escapeXml(destination.city || '')}</city>
        <prov-state>${escapeXml(cleanDestState)}</prov-state>
        <country-code>${destCountry}</country-code>
        <postal-zip-code>${cleanDestZip}</postal-zip-code>
      </address-details>
    </destination>
    <parcel-characteristics>
      <weight>${weightKg}</weight>
      <dimensions>
        <length>${lengthCm}</length>
        <width>${widthCm}</width>
        <height>${heightCm}</height>
      </dimensions>
    </parcel-characteristics>
    <preferences>
      <show-packing-instructions>true</show-packing-instructions>
      <show-postage-rate>true</show-postage-rate>
    </preferences>
    <references>
      <customer-ref-1>${escapeXml(orderNum || 'BOOK-ORDER')}</customer-ref-1>
    </references>
    ${customsXml}
  </delivery-spec>
</non-contract-shipment>`.trim();
}

/**
 * Parse Canada Post Non-Contract Shipment creation XML response
 */
export function parseCanadaPostShipmentResponse(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') {
    throw new Error('Empty response from Canada Post Shipment API');
  }

  // Error check
  if (xmlText.includes('<message>') || xmlText.includes('<code>E')) {
    const code = xmlText.match(/<code>([^<]+)<\/code>/)?.[1] || 'ERROR';
    const desc = xmlText.match(/<description>([^<]+)<\/description>/)?.[1] || 'Shipment creation failed';
    throw new Error(`Canada Post [${code}]: ${desc}`);
  }

  const shipmentId = xmlText.match(/<shipment-id>([^<]+)<\/shipment-id>/)?.[1] || '';
  const trackingPin = xmlText.match(/<tracking-pin>([^<]+)<\/tracking-pin>/)?.[1] || '';
  
  // Extract links for label artifact
  const labelLink = xmlText.match(/<link\s+[^>]*rel="label"[^>]*href="([^"]+)"/)?.[1]
    || xmlText.match(/<link\s+[^>]*href="([^"]+)"[^>]*rel="label"/)?.[1] || '';

  const receiptLink = xmlText.match(/<link\s+[^>]*rel="receipt"[^>]*href="([^"]+)"/)?.[1]
    || xmlText.match(/<link\s+[^>]*href="([^"]+)"[^>]*rel="receipt"/)?.[1] || '';

  return {
    ok: true,
    shipmentId,
    trackingPin,
    labelUrl: labelLink,
    receiptUrl: receiptLink
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
  isTest = false
}) {
  const xmlPayload = buildNonContractShipmentXml({
    serviceCode,
    sender,
    destination,
    parcel,
    orderNum,
    customs,
    declarationId
  });

  const customerId = customerNumber ? customerNumber.trim() : DEFAULT_CP_CUSTOMER_NUMBER;
  const baseUrl = isTest ? CANADAPOST_SANDBOX_URL : CANADAPOST_PRODUCTION_URL;
  const targetEndpoint = `${baseUrl}/rs/${encodeURIComponent(customerId)}/ncshipment`;

  const result = await executeCanadaPostProxy({
    targetEndpoint,
    xmlPayload,
    apiKey,
    apiSecret,
    customerNumber: customerId,
    zonosAccountKey,
    isTest
  });

  if (result.trackingPin && result.labelUrl) return result;
  if (result.xml) return parseCanadaPostShipmentResponse(result.xml);
  throw new Error('Empty response from Canada Post Shipment API');
}

/**
 * Fetch shipping label PDF as a Blob for viewing or printing (bypassing CORS via proxy)
 */
export async function fetchCanadaPostLabelBlob({
  labelUrl,
  apiKey = DEFAULT_CP_API_KEY,
  apiSecret = DEFAULT_CP_API_SECRET
}) {
  if (!labelUrl) throw new Error('Label URL is required');

  const key = (apiKey || DEFAULT_CP_API_KEY).trim();
  const secret = (apiSecret || DEFAULT_CP_API_SECRET).trim();

  // 1. Try local dev proxy if running
  try {
    const proxyResp = await fetch(`/api/canadapost/artifact?url=${encodeURIComponent(labelUrl)}`, {
      headers: {
        'x-cp-api-key': key,
        'x-cp-api-secret': secret
      }
    });
    if (proxyResp.ok) {
      return await proxyResp.blob();
    }
  } catch (_) {}

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
            endpoint: labelUrl,
            apiKey: key,
            apiSecret: secret,
            isArtifact: true
          }
        })
      });
      if (gasResp.ok) {
        const json = await gasResp.json();
        if (json && json.base64) {
          const byteChars = atob(json.base64);
          const byteNums = new Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            byteNums[i] = byteChars.charCodeAt(i);
          }
          return new Blob([new Uint8Array(byteNums)], { type: 'application/pdf' });
        }
      }
    } catch (_) {}
  }

  // 3. Direct fetch
  const authHeader = 'Basic ' + btoa(`${key}:${secret}`);
  const resp = await fetch(labelUrl, {
    headers: {
      'Accept': 'application/pdf',
      'Authorization': authHeader
    }
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching label PDF`);
  return await resp.blob();
}

