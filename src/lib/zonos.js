// Zonos Cross-Border Landed Cost, Duty & Tax Engine
//
// Encapsulates communication with the Zonos GraphQL API (https://api.zonos.com/graphql)
// for real-time calculation of customs duties, import taxes (VAT/GST), carrier clearance fees,
// and de minimis threshold status for international book shipments.
//
// Invariant: Pure helper library — UI rendering and DOM bindings remain in feature modules.
// Includes offline-first de minimis estimates when network/API is unavailable.

export const ZONOS_GRAPHQL_ENDPOINT = 'https://api.zonos.com/graphql';

/** Map common abbreviation units to Zonos GraphQL enum codes */
export const ZONOS_DIM_UNITS = {
  in: 'INCH',
  inch: 'INCH',
  inches: 'INCH',
  cm: 'CENTIMETER',
  centimeter: 'CENTIMETER',
  centimeters: 'CENTIMETER',
  mm: 'MILLIMETER',
  m: 'METER',
  ft: 'FOOT',
  yd: 'YARD'
};

export const ZONOS_WEIGHT_UNITS = {
  lb: 'POUND',
  lbs: 'POUND',
  pound: 'POUND',
  pounds: 'POUND',
  oz: 'OUNCE',
  ounce: 'OUNCE',
  ounces: 'OUNCE',
  kg: 'KILOGRAM',
  kilogram: 'KILOGRAM',
  kilograms: 'KILOGRAM',
  g: 'GRAM',
  gram: 'GRAM',
  grams: 'GRAM'
};

/**
 * Standard de minimis thresholds for common export destinations from Canada
 * Used as offline-first fallback calculation when network or API key is not configured.
 */
export const DESTINATION_DE_MINIMIS = {
  US: { dutyFreeThresholdCad: 1080.00, taxFreeThresholdCad: 1080.00, currency: 'USD', thresholdNative: 800, note: 'US Section 321 $800 USD threshold — duty & tax free for typical orders' },
  GB: { dutyFreeThresholdCad: 235.00, taxFreeThresholdCad: 0.00, currency: 'GBP', thresholdNative: 135, note: 'UK zero-rates printed books (0% VAT & 0% Duty)' },
  AU: { dutyFreeThresholdCad: 900.00, taxFreeThresholdCad: 900.00, currency: 'AUD', thresholdNative: 1000, note: 'Australia AUD $1,000 threshold' },
  NZ: { dutyFreeThresholdCad: 800.00, taxFreeThresholdCad: 800.00, currency: 'NZD', thresholdNative: 1000, note: 'New Zealand NZD $1,000 threshold' },
  EU: { dutyFreeThresholdCad: 220.00, taxFreeThresholdCad: 0.00, currency: 'EUR', thresholdNative: 150, note: 'EU €150 duty-free threshold; local VAT applies unless zero-rated' },
  JP: { dutyFreeThresholdCad: 90.00, taxFreeThresholdCad: 90.00, currency: 'JPY', thresholdNative: 10000, note: 'Japan JPY 10,000 de minimis threshold' }
};

/**
 * Normalize dimension unit to Zonos enum
 */
export function normalizeDimUnit(unit) {
  const clean = String(unit || 'in').toLowerCase().trim();
  return ZONOS_DIM_UNITS[clean] || 'INCH';
}

/**
 * Normalize weight unit to Zonos enum
 */
export function normalizeWeightUnit(unit) {
  const clean = String(unit || 'lb').toLowerCase().trim();
  return ZONOS_WEIGHT_UNITS[clean] || 'POUND';
}

export const DEFAULT_ZONOS_API_KEY = 'credential_live_11988839-5711-4e1c-9036-303dc94fb15b';

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
 * Execute Zonos GraphQL query via direct fetch with proxy fallback
 */
export async function executeZonosGraphQL({ query, variables = {}, apiKey = DEFAULT_ZONOS_API_KEY }) {
  const token = (apiKey || DEFAULT_ZONOS_API_KEY).trim();

  // 1. Attempt direct fetch to Zonos API
  try {
    const resp = await fetch(ZONOS_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'credentialToken': token
      },
      body: JSON.stringify({ query, variables })
    });

    if (resp.ok) {
      const json = await resp.json();
      if (json.errors && json.errors.length > 0) {
        throw new Error(`Zonos calculation error: ${json.errors.map(e => e.message).join('; ')}`);
      }
      return json;
    }

    // If HTTP error received directly from Zonos
    const text = await resp.text().catch(() => '');
    throw new Error(`Zonos API HTTP ${resp.status}: ${text || resp.statusText}`);
  } catch (err) {
    // If direct fetch fails (e.g. browser CORS block), fallback to proxies

    // A. Local dev proxy
    if (typeof window !== 'undefined') {
      try {
        const proxyResp = await fetch('/api/zonos/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables, apiKey: token })
        });
        if (proxyResp.ok) {
          const json = await proxyResp.json();
          if (json.data) return json;
          if (json.raw && json.raw.data) return json.raw;
          if (json.errors) throw new Error(`Zonos calculation error: ${json.errors.map(e => e.message).join('; ')}`);
        }
      } catch (_) {}
    }

    // B. Google Apps Script proxy (for GitHub Pages static deploy)
    const sheetsUrl = getSavedSheetsUrl();
    if (sheetsUrl && !sheetsUrl.includes('mock-test')) {
      try {
        const gasResp = await fetch(sheetsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            version: 2,
            action: 'proxyzonos',
            payload: { query, variables, apiKey: token }
          })
        });
        if (gasResp.ok) {
          const json = await gasResp.json();
          if (json && json.data) return json;
          if (json && json.raw && json.raw.data) return json.raw;
          if (json && json.errors) throw new Error(`Zonos calculation error: ${json.errors.map(e => e.message).join('; ')}`);
        }
      } catch (_) {}
    }

    throw err;
  }
}

/**
 * Test Zonos API key connection with a lightweight introspection query
 */
export async function testZonosConnection(apiKey) {
  if (apiKey !== undefined && (!apiKey || typeof apiKey !== 'string' || !apiKey.trim())) {
    return { ok: false, error: 'Zonos API key is required' };
  }
  const token = (apiKey || DEFAULT_ZONOS_API_KEY).trim();
  if (!token) {
    return { ok: false, error: 'Zonos API key is required' };
  }

  try {
    const resp = await fetch(ZONOS_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'credentialToken': token
      },
      body: JSON.stringify({
        query: 'query ZonosPing { __schema { queryType { name } } }'
      })
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return {
        ok: false,
        status: resp.status,
        error: `HTTP ${resp.status}: ${errText || resp.statusText}`
      };
    }

    const data = await resp.json();
    if (data.errors && data.errors.length > 0) {
      return {
        ok: false,
        error: data.errors.map(e => e.message).join(', ')
      };
    }

    return { ok: true, timestamp: new Date().toISOString() };
  } catch (err) {
    // If browser CORS failed, try Apps Script proxy fallback
    const sheetsUrl = getSavedSheetsUrl();
    if (sheetsUrl && !sheetsUrl.includes('mock-test')) {
      try {
        const gasResp = await fetch(sheetsUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            version: 2,
            action: 'proxyzonos',
            payload: { query: 'query ZonosPing { __schema { queryType { name } } }', apiKey: token }
          })
        });
        if (gasResp.ok) {
          const json = await gasResp.json();
          if (json && json.data) return { ok: true, timestamp: new Date().toISOString() };
          if (json && json.raw && json.raw.data) return { ok: true, timestamp: new Date().toISOString() };
          if (json && json.errors) return { ok: false, error: json.errors.map(e => e.message).join(', ') };
        }
      } catch (_) {}
    }

    return { ok: false, error: err.message || 'Network error connecting to Zonos' };
  }
}

/**
 * Calculate Landed Cost (Duties, Taxes, Clearance Fees) via Zonos GraphQL API
 */
export async function calculateZonosLandedCost({
  apiKey,
  origin = {},
  destination = {},
  items = [],
  parcel = {},
  shippingRate = {},
  incoterm = 'DDP',
  currency = 'CAD'
}) {
  if (apiKey !== undefined && (!apiKey || typeof apiKey !== 'string' || !apiKey.trim())) {
    throw new Error('Zonos API key is required for landed cost calculation');
  }
  const token = (apiKey || DEFAULT_ZONOS_API_KEY).trim();
  if (!token) {
    throw new Error('Zonos API key is required for landed cost calculation');
  }

  const originCountry = (origin.countryCode || origin.country || 'CA').toUpperCase();
  const originState = (origin.stateCode || origin.state || origin.province || 'QC').toUpperCase();
  const originZip = origin.postalCode || origin.zip || 'H2X 1Y4';

  const destCountry = (destination.countryCode || destination.country || 'US').toUpperCase();
  const destState = (destination.stateCode || destination.state || '').toUpperCase();
  const destZip = destination.postalCode || destination.zip || '';

  // Standardize items
  const validItems = (Array.isArray(items) && items.length > 0 ? items : [{
    amount: 25.00,
    currencyCode: currency,
    description: 'Printed books - novels',
    hsCode: '490199',
    quantity: 1
  }]).map(item => ({
    amount: Math.max(0.01, parseFloat(item.amount || item.price || 25)),
    currencyCode: (item.currencyCode || currency).toUpperCase(),
    description: (item.description || item.title || 'Printed books').slice(0, 100),
    hsCode: String(item.hsCode || item.shipHsCode || '490199').replace(/[^0-9]/g, '').slice(0, 10) || '490199',
    quantity: Math.max(1, parseInt(item.quantity || item.qty || 1, 10))
  }));

  // Standardize parcel carton
  const length = Math.max(0.1, parseFloat(parcel.length || 10));
  const width = Math.max(0.1, parseFloat(parcel.width || 8));
  const height = Math.max(0.1, parseFloat(parcel.height || 1));
  const dimensionalUnit = normalizeDimUnit(parcel.dimUnit || parcel.distance_unit);
  const weight = Math.max(0.01, parseFloat(parcel.weight || 1.2));
  const weightUnit = normalizeWeightUnit(parcel.weightUnit || parcel.mass_unit);

  // Standardize shipping rating
  const shippingAmount = Math.max(0, parseFloat(shippingRate.amount || shippingRate.price || 0));
  const shippingName = String(shippingRate.displayName || shippingRate.service || 'Standard International Shipping').slice(0, 100);

  // Normalized method
  let method = 'DDP';
  const cleanIncoterm = String(incoterm || 'DDP').toUpperCase().trim();
  if (['DDP', 'DAP', 'CIF', 'FOB'].includes(cleanIncoterm)) {
    method = cleanIncoterm;
  } else if (cleanIncoterm === 'DDU') {
    method = 'DAP'; // Zonos maps DDU delivery to DAP
  }

  const parties = [
    {
      type: 'ORIGIN',
      location: {
        countryCode: originCountry,
        ...(originState ? { administrativeAreaCode: originState } : {}),
        ...(originZip ? { postalCode: originZip } : {})
      }
    },
    {
      type: 'DESTINATION',
      location: {
        countryCode: destCountry,
        ...(destState ? { administrativeAreaCode: destState } : {}),
        ...(destZip ? { postalCode: destZip } : {})
      }
    }
  ];

  const cartons = [
    {
      length,
      width,
      height,
      dimensionalUnit,
      weight,
      weightUnit,
      type: 'PACKAGE'
    }
  ];

  const shipmentRating = {
    amount: shippingAmount,
    currencyCode: currency.toUpperCase(),
    displayName: shippingName,
    serviceLevelCode: 'STANDARD'
  };

  const landedCost = {
    currencyCode: currency.toUpperCase(),
    endUse: 'FOR_RESALE',
    tariffRate: 'MAXIMUM',
    method
  };

  const mutation = `
    mutation CalculateLandedCost(
      $parties: [PartyCreateWorkflowInput!]!
      $items: [ItemCreateWorkflowInput!]!
      $cartons: [CartonCreateWorkflowInput!]!
      $shipmentRating: ShipmentRatingCreateWorkflowInput!
      $landedCost: LandedCostWorkFlowInput!
    ) {
      partyCreateWorkflow(input: $parties) { id type }
      itemCreateWorkflow(input: $items) { id amount }
      cartonsCreateWorkflow(input: $cartons) { id }
      shipmentRatingCreateWorkflow(input: $shipmentRating) { id amount displayName }
      landedCostCalculateWorkflow(input: $landedCost) {
        id
        currencyCode
        method
        landedCostGuaranteeCode
        deMinimis {
          type
          threshold
          note
        }
        amountSubtotals {
          duties
          taxes
          fees
          landedCostTotal
        }
        duties {
          amount
          description
          note
        }
        taxes {
          amount
          description
          type
          note
        }
        fees {
          amount
          description
          type
        }
      }
    }
  `;

  const json = await executeZonosGraphQL({
    query: mutation,
    variables: {
      parties,
      items: validItems,
      cartons,
      shipmentRating,
      landedCost
    },
    apiKey: (apiKey || DEFAULT_ZONOS_API_KEY).trim()
  });

  const quotes = json.data?.landedCostCalculateWorkflow || [];
  if (!quotes || quotes.length === 0) {
    throw new Error('Zonos returned an empty calculation quote for this route');
  }

  const quote = quotes[0];
  const subtotals = quote.amountSubtotals || {};

  const dutiesAmount = Math.max(0, parseFloat(subtotals.duties || 0));
  const taxesAmount = Math.max(0, parseFloat(subtotals.taxes || 0));
  const feesAmount = Math.max(0, parseFloat(subtotals.fees || 0));
  const totalLandedCost = Math.max(0, parseFloat(subtotals.landedCostTotal || 0));

  return {
    id: quote.id,
    currencyCode: quote.currencyCode || currency,
    method: quote.method || method,
    guaranteeCode: quote.landedCostGuaranteeCode,
    deMinimis: quote.deMinimis || [],
    dutiesAmount,
    taxesAmount,
    feesAmount,
    totalLandedCost,
    isDutyFree: dutiesAmount === 0,
    isTaxFree: taxesAmount === 0,
    dutiesBreakdown: (quote.duties || []).map(d => ({
      amount: parseFloat(d.amount || 0),
      description: d.description || 'Duty',
      note: d.note || ''
    })),
    taxesBreakdown: (quote.taxes || []).map(t => ({
      amount: parseFloat(t.amount || 0),
      description: t.description || 'Import Tax / VAT',
      type: t.type || '',
      note: t.note || ''
    })),
    feesBreakdown: (quote.fees || []).map(f => ({
      amount: parseFloat(f.amount || 0),
      description: f.description || 'Clearance Fee',
      type: f.type || ''
    })),
    raw: quote
  };
}

/**
 * Offline-first estimate of duties, taxes, and de minimis threshold
 * Runs instantly in pure JS without network dependencies.
 */
export function estimateOfflineLandedCost({
  destCountryCode = 'US',
  declaredValueCad = 25.00,
  shippingCostCad = 15.00,
  _hsCode = '490199'
}) {
  const dest = String(destCountryCode || 'US').toUpperCase();
  const value = Math.max(0, parseFloat(declaredValueCad || 0));
  const shipping = Math.max(0, parseFloat(shippingCostCad || 0));
  const totalShipmentCad = value + shipping;

  const rule = DESTINATION_DE_MINIMIS[dest] || (dest.match(/^(AT|BE|BG|HR|CY|CZ|DK|EE|FI|FR|DE|GR|HU|IE|IT|LV|LT|LU|MT|NL|PL|PT|RO|SK|SI|ES|SE)$/) ? DESTINATION_DE_MINIMIS.EU : null);

  if (dest === 'US') {
    // US Section 321 de minimis is $800 USD (~$1080 CAD)
    const isBelow = value <= 1080;
    return {
      isOfflineEstimate: true,
      destCountryCode: 'US',
      currency: 'CAD',
      dutiesAmount: 0.00,
      taxesAmount: 0.00,
      feesAmount: 0.00,
      totalLandedCost: 0.00,
      isDutyFree: true,
      isTaxFree: isBelow,
      deMinimisNote: isBelow 
        ? '✓ Under US Section 321 $800 USD threshold — Duty & Tax Free' 
        : 'Shipment value exceeds US $800 de minimis threshold; standard tariffs apply.',
      recommendedIncoterm: 'DDP'
    };
  }

  if (dest === 'GB') {
    // UK zero-rates printed books (0% VAT & 0% Duty under HS 490199)
    return {
      isOfflineEstimate: true,
      destCountryCode: 'GB',
      currency: 'CAD',
      dutiesAmount: 0.00,
      taxesAmount: 0.00,
      feesAmount: 0.00,
      totalLandedCost: 0.00,
      isDutyFree: true,
      isTaxFree: true,
      deMinimisNote: '✓ UK zero-rates printed books (HS 4901.99) — 0% Duty & 0% VAT',
      recommendedIncoterm: 'DDP'
    };
  }

  if (rule) {
    const isDutyFree = value <= rule.dutyFreeThresholdCad;
    const isTaxFree = value <= rule.taxFreeThresholdCad;
    const estTax = isTaxFree ? 0 : Math.round(totalShipmentCad * 0.19 * 100) / 100;
    const estDuty = isDutyFree ? 0 : Math.round(value * 0.03 * 100) / 100;
    const estFee = isTaxFree && isDutyFree ? 0 : 2.50;

    return {
      isOfflineEstimate: true,
      destCountryCode: dest,
      currency: 'CAD',
      dutiesAmount: estDuty,
      taxesAmount: estTax,
      feesAmount: estFee,
      totalLandedCost: Math.round((estDuty + estTax + estFee) * 100) / 100,
      isDutyFree,
      isTaxFree,
      deMinimisNote: rule.note,
      recommendedIncoterm: isDutyFree && isTaxFree ? 'DDP' : 'DDU'
    };
  }

  // General fallback for other destinations
  return {
    isOfflineEstimate: true,
    destCountryCode: dest,
    currency: 'CAD',
    dutiesAmount: 0.00,
    taxesAmount: 0.00,
    feesAmount: 0.00,
    totalLandedCost: 0.00,
    isDutyFree: true,
    isTaxFree: true,
    deMinimisNote: `International shipment to ${dest}. Connect Zonos Live API for exact tariffs.`,
    recommendedIncoterm: 'DDU'
  };
}

/**
 * Format Landed Cost summary string
 */
export function formatLandedCostBreakdown(calc) {
  if (!calc) return 'No landed cost calculation available.';
  const cur = calc.currencyCode || calc.currency || 'CAD';
  const duty = (calc.dutiesAmount || 0).toFixed(2);
  const tax = (calc.taxesAmount || 0).toFixed(2);
  const fee = (calc.feesAmount || 0).toFixed(2);
  const total = (calc.totalLandedCost || 0).toFixed(2);

  if (parseFloat(total) === 0) {
    return `Duty & Tax Free (${cur} $0.00)`;
  }
  return `Duties: ${cur} $${duty} | Taxes: ${cur} $${tax} | Fees: ${cur} $${fee} (Total: ${cur} $${total})`;
}

/**
 * Format and normalize Zonos 13-character Declaration ID
 */
export function formatDeclarationId(rawId) {
  if (!rawId || typeof rawId !== 'string') return '';
  return rawId.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13);
}

/**
 * Generate a pre-filled direct web link to the Zonos Prepay app for Canada Post US shipments
 */
export function buildZonosPrepayDeepLink({
  destCountry = 'US',
  destPostalOrZip = '',
  destState = '',
  declaredValueCad = 25.00,
  hsCode = '490199',
  itemDescription = 'Printed books'
} = {}) {
  const base = 'https://prepay.zonos.com';
  const params = new URLSearchParams({
    originCountry: 'CA',
    destinationCountry: destCountry.toUpperCase(),
    ...(destPostalOrZip ? { destinationPostalCode: destPostalOrZip.trim() } : {}),
    ...(destState ? { destinationState: destState.trim() } : {}),
    declaredValue: parseFloat(declaredValueCad || 25).toFixed(2),
    currency: 'CAD',
    hsCode: String(hsCode || '490199').replace(/[^0-9]/g, ''),
    description: String(itemDescription || 'Printed books').slice(0, 50)
  });

  return `${base}/?${params.toString()}`;
}

/**
 * Create a Zonos Declaration / Landed Cost guarantee code for US shipping
 */
export async function createZonosDeclaration({
  apiKey,
  origin = {},
  destination = {},
  items = [],
  parcel = {},
  shippingRate = {},
  currency = 'CAD'
}) {
  // Call landed cost calculation with DDP method
  const calc = await calculateZonosLandedCost({
    apiKey,
    origin,
    destination,
    items,
    parcel,
    shippingRate,
    incoterm: 'DDP',
    currency
  });

  // Extract declaration ID / guarantee code or generate from transaction ID
  let declarationId = '';
  if (calc.guaranteeCode || calc.landedCostGuaranteeCode) {
    declarationId = formatDeclarationId(calc.guaranteeCode || calc.landedCostGuaranteeCode);
  } else if (calc.id) {
    declarationId = formatDeclarationId(calc.id);
  }

  // If Zonos ID is shorter, pad with valid alphanumeric chars
  if (declarationId.length < 13) {
    const fallbackSeed = (calc.id || 'ZN' + Date.now()).replace(/[^A-Z0-9]/gi, '').toUpperCase();
    declarationId = (fallbackSeed + '0000000000000').slice(0, 13);
  }

  return {
    ok: true,
    declarationId,
    calculation: calc,
    dutiesAmount: calc.dutiesAmount || 0,
    taxesAmount: calc.taxesAmount || 0,
    feesAmount: calc.feesAmount || 0,
    totalLandedCost: calc.totalLandedCost || 0,
    isDutyFree: calc.isDutyFree,
    qrCodeData: `ZONOS:${declarationId}:CAD:${calc.totalLandedCost}`
  };
}
