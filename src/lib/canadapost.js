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

/**
 * Fetch live rates directly from Canada Post or via local backend proxy
 */
export async function getCanadaPostRates({
  originPostalCode = 'M4B1B3',
  destCountry = 'CA',
  destPostalOrZip = '',
  weightKg = 0.5,
  lengthCm = 20,
  widthCm = 15,
  heightCm = 2,
  apiKey = '',
  apiSecret = '',
  customerNumber = '',
  contractId = '',
  isTest = false,
  proxyUrl = '/api/canadapost/rates'
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
  const authHeader = 'Basic ' + btoa(`${(apiKey || '').trim()}:${(apiSecret || '').trim()}`);

  // Try proxy first if running locally or configured
  try {
    const proxyResp = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        xmlPayload,
        isTest,
        apiKey,
        apiSecret,
        targetEndpoint
      })
    });

    if (proxyResp.ok) {
      const data = await proxyResp.json();
      if (data.rates && Array.isArray(data.rates)) return data.rates;
      if (data.xml) return parseCanadaPostPriceQuotes(data.xml);
    }
  } catch (_) {
    // Fall back to direct fetch if proxy not running
  }

  // Direct fetch to Canada Post REST Gateway
  const resp = await fetch(targetEndpoint, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.cpc.ship.rate-v4+xml',
      'Content-Type': 'application/vnd.cpc.ship.rate-v4+xml',
      'Authorization': authHeader,
      'Accept-language': 'en-CA'
    },
    body: xmlPayload
  });

  const text = await resp.text();
  if (!resp.ok && !text.includes('<price-quote>')) {
    let errMsg = `HTTP ${resp.status} ${resp.statusText}`;
    if (text.includes('<description>')) {
      const desc = text.match(/<description>([^<]+)<\/description>/)?.[1];
      if (desc) errMsg = desc;
    }
    throw new Error(`Canada Post API error: ${errMsg}`);
  }

  return parseCanadaPostPriceQuotes(text);
}

/**
 * Lightweight ping test function to verify Canada Post credentials
 */
export async function testCanadaPostConnection({
  apiKey = '',
  apiSecret = '',
  customerNumber = '',
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
 * Build XML payload for creating a Non-Contract Shipment with Canada Post
 */
export function buildNonContractShipmentXml({
  serviceCode = 'DOM.EP',
  sender = {},
  destination = {},
  parcel = {},
  orderNum = '',
  customs = null
}) {
  const weightKg = Math.max(0.01, parseFloat(parcel.weightKg || 0.5)).toFixed(3);
  const lengthCm = Math.max(0.1, parseFloat(parcel.lengthCm || 20)).toFixed(1);
  const widthCm = Math.max(0.1, parseFloat(parcel.widthCm || 15)).toFixed(1);
  const heightCm = Math.max(0.1, parseFloat(parcel.heightCm || 2)).toFixed(1);

  const cleanOriginZip = cleanPostalCode(sender.postalCode) || 'M4B1B3';
  const destCountry = String(destination.countryCode || 'CA').toUpperCase().trim();
  const cleanDestZip = destCountry === 'CA' ? cleanPostalCode(destination.postalCode) : (destination.postalCode || destination.zip || '90210');

  let customsXml = '';
  if (destCountry !== 'CA' && customs) {
    const qty = Math.max(1, parseInt(customs.quantity, 10) || 1);
    const declaredVal = Math.max(1, parseFloat(customs.declaredValue || 25)).toFixed(2);
    const customsDesc = String(customs.description || 'Printed books').slice(0, 44);
    const hsCode = String(customs.hsCode || '490199').replace(/[^0-9]/g, '').slice(0, 6) || '490199';
    customsXml = `
    <customs>
      <currency>CAD</currency>
      <conversion-from-cad>1.0</conversion-from-cad>
      <reason-for-export>SOG</reason-for-export>
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<non-contract-shipment xmlns="http://www.canadapost.ca/ws/ncshipment-v4">
  <delivery-spec>
    <service-code>${serviceCode}</service-code>
    <sender>
      <name>${escapeXml(sender.name || 'Lyricalmyrical Books')}</name>
      <company>${escapeXml(sender.company || 'Lyricalmyrical Books')}</company>
      <contact-phone>${escapeXml(sender.phone || '4165550199')}</contact-phone>
      <address-details>
        <address-line-1>${escapeXml(sender.address1 || '123 Main St')}</address-line-1>
        <city>${escapeXml(sender.city || 'Toronto')}</city>
        <prov-state>${escapeXml(sender.province || 'ON')}</prov-state>
        <postal-zip-code>${cleanOriginZip}</postal-zip-code>
      </address-details>
    </sender>
    <destination>
      <name>${escapeXml(destination.name || 'Customer')}</name>
      <company>${escapeXml(destination.company || '')}</company>
      <client-voice-number>${escapeXml(destination.phone || '5555555555')}</client-voice-number>
      <address-details>
        <address-line-1>${escapeXml(destination.address1 || '')}</address-line-1>
        <city>${escapeXml(destination.city || '')}</city>
        <prov-state>${escapeXml(destination.province || destination.state || '')}</prov-state>
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
  apiKey = '',
  apiSecret = '',
  customerNumber = '',
  isTest = false,
  proxyUrl = '/api/canadapost/shipment'
}) {
  const xmlPayload = buildNonContractShipmentXml({
    serviceCode,
    sender,
    destination,
    parcel,
    orderNum,
    customs
  });

  const customerId = customerNumber ? customerNumber.trim() : '0007123456';
  const baseUrl = isTest ? CANADAPOST_SANDBOX_URL : CANADAPOST_PRODUCTION_URL;
  const targetEndpoint = `${baseUrl}/rs/${encodeURIComponent(customerId)}/ncshipment`;
  const authHeader = 'Basic ' + btoa(`${(apiKey || '').trim()}:${(apiSecret || '').trim()}`);

  // Try proxy first
  try {
    const proxyResp = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        xmlPayload,
        isTest,
        apiKey,
        apiSecret,
        targetEndpoint,
        customerNumber: customerId
      })
    });

    if (proxyResp.ok) {
      const data = await proxyResp.json();
      if (data.trackingPin && data.labelUrl) return data;
      if (data.xml) return parseCanadaPostShipmentResponse(data.xml);
    }
  } catch (_) {
    // Fall back to direct fetch
  }

  // Direct fetch to Canada Post Gateway
  const resp = await fetch(targetEndpoint, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.cpc.ncshipment-v4+xml',
      'Content-Type': 'application/vnd.cpc.ncshipment-v4+xml',
      'Authorization': authHeader,
      'Accept-language': 'en-CA'
    },
    body: xmlPayload
  });

  const text = await resp.text();
  return parseCanadaPostShipmentResponse(text);
}

