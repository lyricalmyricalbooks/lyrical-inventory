import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cleanPostalCode,
  buildRateScenarioJson,
  parseCanadaPostPriceQuotes,
  estimateOfflineCanadaPostRates,
  CANADAPOST_SERVICES
} from '../src/lib/canadapost.js';

describe('Canada Post XML & Postal Code Helpers', () => {
  it('cleans Canadian postal codes to 6 alphanumeric characters', () => {
    expect(cleanPostalCode('M4B 1B3')).toBe('M4B1B3');
    expect(cleanPostalCode('v6b-2w9')).toBe('V6B2W9');
    expect(cleanPostalCode('k1a 0b1 ')).toBe('K1A0B1');
    expect(cleanPostalCode('')).toBe('');
  });

  it('builds valid domestic JSON mailing scenario payload', () => {
    const jsonStr = buildRateScenarioJson({
      originPostalCode: 'M4B 1B3',
      destCountry: 'CA',
      destPostalOrZip: 'V6B 2W9',
      weightKg: 0.85,
      lengthCm: 23,
      widthCm: 19.5,
      heightCm: 2,
      customerNumber: '0007123456',
      contractId: '4299100'
    });

    expect(jsonStr).toContain('"originPostalCode":"M4B1B3"');
    expect(jsonStr).toContain('"postalCode":"V6B2W9"');
    expect(jsonStr).toContain('"weight":0.85');
    expect(jsonStr).toContain('"length":23');
    expect(jsonStr).toContain('"width":19.5');
    expect(jsonStr).toContain('"height":2');
    expect(jsonStr).toContain('"customerNumber":"0007123456"');
    expect(jsonStr).toContain('"contractId":"4299100"');
  });

  it('builds valid US and International JSON destinations', () => {
    const usJson = buildRateScenarioJson({
      destCountry: 'US',
      destPostalOrZip: '90210'
    });
    expect(usJson).toContain('"unitedStates"');
    expect(usJson).toContain('"zipCode":"90210"');

    const intJson = buildRateScenarioJson({
      destCountry: 'GB'
    });
    expect(intJson).toContain('"countryCode":"GB"');
  });
});

describe('Canada Post Price Quotes Parser', () => {
  const sampleJsonResponse = JSON.stringify({
    "priceQuotes": {
      "priceQuote": [
        {
          "serviceCode": "DOM.RP",
          "serviceName": "Regular Parcel",
          "priceDetails": {
            "base": 12.45,
            "due": 14.07,
            "taxes": {
              "gst": 0.62,
              "pst": 1.00
            }
          },
          "serviceStandard": {
            "expectedTransitTime": 5,
            "expectedDeliveryDate": "2026-08-28"
          }
        },
        {
          "serviceCode": "DOM.XP",
          "serviceName": "Xpresspost",
          "priceDetails": {
            "base": 18.50,
            "due": 20.91,
            "taxes": {
              "hst": 2.41
            }
          },
          "serviceStandard": {
            "expectedTransitTime": 2,
            "expectedDeliveryDate": "2026-08-25"
          }
        }
      ]
    }
  });

  it('parses JSON price quotes into sorted rate objects', () => {
    const quotes = parseCanadaPostPriceQuotes(sampleJsonResponse);
    expect(quotes).toHaveLength(2);
    
    // Sorted cheapest first
    expect(quotes[0].serviceCode).toBe('DOM.RP');
    expect(quotes[0].serviceName).toBe('Regular Parcel');
    expect(quotes[0].basePrice).toBe(12.45);
    expect(quotes[0].totalPrice).toBe(14.07);
    expect(quotes[0].taxes).toBe(1.62);
    expect(quotes[0].transitDays).toBe(5);
    expect(quotes[0].deliveryDate).toBe('2026-08-28');
    expect(quotes[0].estimatedSpeed).toBe('5 business days');

    expect(quotes[1].serviceCode).toBe('DOM.XP');
    expect(quotes[1].totalPrice).toBe(20.91);
    expect(quotes[1].hst).toBe(2.41);
    expect(quotes[1].transitDays).toBe(2);
  });

  it('throws helpful error on Canada Post error messages', () => {
    const errorJson = JSON.stringify({
      messages: {
        message: [
          {
            code: "E002",
            description: "AAA Authentication Failure"
          }
        ]
      }
    });

    expect(() => parseCanadaPostPriceQuotes(errorJson)).toThrow('Canada Post [E002]: AAA Authentication Failure');
  });
});

describe('Offline Canada Post Rate Estimator', () => {
  it('calculates instant offline fallback rates for domestic, USA, and international', () => {
    const domestic = estimateOfflineCanadaPostRates({ destCountry: 'CA', weightKg: 0.5 });
    expect(domestic.length).toBeGreaterThanOrEqual(2);
    expect(domestic.find(r => r.serviceCode === 'DOM.EP')).toBeDefined();

    const usa = estimateOfflineCanadaPostRates({ destCountry: 'US', weightKg: 1.0 });
    expect(usa.find(r => r.serviceCode === 'USA.TP')).toBeDefined();

    const intl = estimateOfflineCanadaPostRates({ destCountry: 'GB', weightKg: 0.75 });
    expect(intl.find(r => r.serviceCode === 'INT.TP')).toBeDefined();
  });
});

describe('Canada Post Label & Shipment Creation', () => {
  it('builds valid Non-Contract Shipment JSON with sender, recipient, and customs', async () => {
    const { buildNonContractShipmentJson } = await import('../src/lib/canadapost.js');
    const jsonStr = buildNonContractShipmentJson({
      serviceCode: 'USA.TP',
      sender: {
        name: 'Lyrical Books',
        company: 'Lyricalmyrical Books',
        phone: '4165550199',
        address1: '123 Main St',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M4B 1B3'
      },
      destination: {
        name: 'Jane Doe',
        company: 'Art Studio',
        phone: '2125551234',
        address1: '456 Broadway',
        city: 'New York',
        state: 'NY',
        countryCode: 'US',
        postalCode: '10001'
      },
      parcel: {
        lengthCm: 23,
        widthCm: 19.5,
        heightCm: 2,
        weightKg: 0.45
      },
      orderNum: 'ORD-2026-99',
      customs: {
        quantity: 1,
        description: 'Hardcover poetry books',
        declaredValue: 40.00,
        hsCode: '4901.99.00'
      }
    });

    expect(jsonStr).toContain('"serviceCode":"USA.TP"');
    expect(jsonStr).toContain('"postalZipCode":"M4B1B3"');
    expect(jsonStr).toContain('"countryCode":"US"');
    expect(jsonStr).toContain('"postalZipCode":"10001"');
    expect(jsonStr).toContain('"customsDescription":"Hardcover poetry books"');
    expect(jsonStr).toContain('"hsTariffCode":"490199"');
    expect(jsonStr).toContain('"customerRef1":"ORD-2026-99"');
  });

  it('parses successful shipment response with tracking PIN and label artifact link', async () => {
    const { parseCanadaPostShipmentResponse } = await import('../src/lib/canadapost.js');
    const sampleShipmentJson = JSON.stringify({
      "nonContractShipmentInfo": {
        "shipmentId": "123456789012345678",
        "trackingPin": "1234567890123456",
        "links": {
          "link": [
            { "@rel": "self", "@href": "https://api.canadapost-postescanada.ca/rs/0007123456/ncshipment/123456789012345678", "@media-type": "application/vnd.cpc.ncshipment-v4+xml" },
            { "@rel": "label", "@href": "https://api.canadapost-postescanada.ca/rs/artifact/6e933e69452/10000/0", "@media-type": "application/pdf" },
            { "@rel": "receipt", "@href": "https://api.canadapost-postescanada.ca/rs/0007123456/ncshipment/123456789012345678/receipt", "@media-type": "application/vnd.cpc.ncshipment-v4+xml" }
          ]
        }
      }
    });

    const parsed = parseCanadaPostShipmentResponse(sampleShipmentJson);
    expect(parsed.ok).toBe(true);
    expect(parsed.shipmentId).toBe('123456789012345678');
    expect(parsed.trackingPin).toBe('1234567890123456');
    expect(parsed.labelUrl).toBe('https://api.canadapost-postescanada.ca/rs/artifact/6e933e69452/10000/0');
    expect(parsed.receiptUrl).toBe('https://api.canadapost-postescanada.ca/rs/0007123456/ncshipment/123456789012345678/receipt');
  });

  it('validates 13-character Zonos Declaration ID format and embeds it in customs XML', async () => {
    const { validateDeclarationId, formatDeclarationId, buildNonContractShipmentJson } = await import('../src/lib/canadapost.js');

    expect(validateDeclarationId('0rd4dpkrvc1y9')).toBe(true);
    expect(validateDeclarationId('0RD4DPKRVC1Y9')).toBe(true);
    expect(validateDeclarationId('short')).toBe(false);
    expect(validateDeclarationId('toolongdeclarationid123')).toBe(false);
    expect(validateDeclarationId('')).toBe(false);

    // Zonos issues Declaration IDs as lowercase base36; the canonical form is preserved
    // exactly, because Canada Post forwards the value verbatim to U.S. customs.
    expect(formatDeclarationId('0RD4DPKRVC1Y9')).toBe('0rd4dpkrvc1y9');
    expect(formatDeclarationId('0rd4-dpkr-vc1y9')).toBe('0rd4dpkrvc1y9');
    expect(formatDeclarationId('')).toBe('');
    expect(formatDeclarationId(null)).toBe('');

    const jsonStr = buildNonContractShipmentJson({
      serviceCode: 'USA.TP',
      destination: { countryCode: 'US', postalCode: '90210' },
      parcel: { weightKg: 0.5 },
      declarationId: '0rd4dpkrvc1y9'
    });

    expect(jsonStr).toContain('"declarationId":"0rd4dpkrvc1y9"');
    expect(jsonStr).not.toContain('"declarationId":"0RD4DPKRVC1Y9"');
  });

  it('keeps a Zonos Declaration ID lowercase even when it arrives upper-cased', async () => {
    const { buildNonContractShipmentJson } = await import('../src/lib/canadapost.js');
    const jsonStr = buildNonContractShipmentJson({
      serviceCode: 'USA.TP',
      destination: { countryCode: 'US', postalCode: '90210' },
      parcel: { weightKg: 0.5 },
      customs: { declarationId: '0RCVXJ2TKBNWR', declaredValue: 25, quantity: 1 }
    });
    expect(jsonStr).toContain('"declarationId":"0rcvxj2tkbnwr"');
  });

  it('normalizes full state and province names to 2-letter postal codes', async () => {
    const { normalizeStateOrProvince } = await import('../src/lib/canadapost.js');
    expect(normalizeStateOrProvince('Arizona', 'US')).toBe('AZ');
    expect(normalizeStateOrProvince('arizona')).toBe('AZ');
    expect(normalizeStateOrProvince('California', 'US')).toBe('CA');
    expect(normalizeStateOrProvince('New York', 'US')).toBe('NY');
    expect(normalizeStateOrProvince('Ontario', 'CA')).toBe('ON');
    expect(normalizeStateOrProvince('British Columbia', 'CA')).toBe('BC');
    expect(normalizeStateOrProvince('QC')).toBe('QC');
    expect(normalizeStateOrProvince('WA')).toBe('WA');
  });

  it('correctly formats multi-line addresses and normalized states in shipment JSON', async () => {
    const { buildNonContractShipmentJson } = await import('../src/lib/canadapost.js');
    const jsonStr = buildNonContractShipmentJson({
      serviceCode: 'USA.TP',
      sender: {
        name: 'Lyricalmyrical Books',
        address1: '123 Bookish Way',
        address2: 'Suite 400',
        city: 'Toronto',
        province: 'Ontario',
        postalCode: 'M4B 1B3'
      },
      destination: {
        name: 'Daniela Dawson',
        address1: 'PO Box 897',
        address2: '29e laundry hill road',
        city: 'Bisbee',
        state: 'Arizona',
        countryCode: 'US',
        postalCode: '85603'
      },
      parcel: { weightKg: 0.357, lengthCm: 19.5, widthCm: 15, heightCm: 2 }
    });

    expect(jsonStr).toContain('"addressLine1":"123 Bookish Way"');
    expect(jsonStr).toContain('"addressLine2":"Suite 400"');
    expect(jsonStr).toContain('"provState":"ON"');
    expect(jsonStr).toContain('"name":"Daniela Dawson"');
    expect(jsonStr).toContain('"addressLine1":"PO Box 897"');
    expect(jsonStr).toContain('"addressLine2":"29e laundry hill road"');
    expect(jsonStr).toContain('"city":"Bisbee"');
    expect(jsonStr).toContain('"provState":"AZ"');
    expect(jsonStr).toContain('"postalZipCode":"85603"');
  });

  it('generates authentic Code 128 barcode SVG rect elements', async () => {
    const { generateCode128SvgBars } = await import('../src/lib/canadapost.js');
    const svgBars = generateCode128SvgBars('7012345678901234');
    expect(svgBars).toContain('<rect');
    expect(svgBars).toContain('fill="#000000"');
  });

  it('generates full 4x6 vector Canada Post shipping label SVG with customs and Zonos DDP', async () => {
    const { generateCanadaPostLabelSvg } = await import('../src/lib/canadapost.js');
    const svg = generateCanadaPostLabelSvg({
      serviceCode: 'USA.TP',
      serviceName: 'Tracked Packet - USA',
      trackingPin: '7012345678901234',
      sender: { name: 'Lyricalmyrical Books', address1: '123 Main St', city: 'Toronto', province: 'ON', postalCode: 'M4B 1B3' },
      destination: { name: 'Daniela Dawson', address1: 'PO Box 897', city: 'Bisbee', state: 'AZ', postalCode: '85603', countryCode: 'US' },
      parcel: { weightKg: 0.357, lengthCm: 19.5, widthCm: 15, heightCm: 2 },
      customs: { description: 'Printed books', quantity: 1, declaredValue: 25.00, hsCode: '490199' },
      declarationId: 'ZONOS12345678'
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('CANADA POST');
    expect(svg).toContain('POSTES CANADA');
    expect(svg).toContain('DANIELA DAWSON');
    expect(svg).toContain('85603');
    expect(svg).toContain('CUSTOMS DECLARATION');
    expect(svg).toContain('ZONOS DECLARATION ID:');
    expect(svg).toContain('ZONOS12345678');
  });

  it('generates vector printable Blob from shipment context with zero network errors', async () => {
    const { generateClientCanadaPostLabelBlob, fetchCanadaPostLabelBlob, setLastPurchasedShipmentContext } = await import('../src/lib/canadapost.js');
    const context = {
      serviceCode: 'DOM.EP',
      trackingPin: '7012999988881111',
      sender: { name: 'Lyrical Books' },
      destination: { name: 'Jane Doe', postalCode: 'V6B 2W9', countryCode: 'CA' }
    };

    setLastPurchasedShipmentContext(context);
    const blob1 = generateClientCanadaPostLabelBlob(context);
    expect(blob1).toBeInstanceOf(Blob);

    const blob2 = await fetchCanadaPostLabelBlob({ labelUrl: 'local://canadapost/label/7012999988881111' });
    expect(blob2).toBeInstanceOf(Blob);
  });
});




// A live shipment is refused without a real return address and sender phone, so
// every live-mode purchase below ships with one. Only sandbox runs may omit it.
const realSender = {
  name: 'Lyricalmyrical Books',
  phone: '4165550142',
  address1: '88 Bookish Way',
  city: 'Toronto',
  province: 'ON',
  postalCode: 'M4B 1B3',
};

describe('Canada Post Account & Environment Validation', () => {
  it('serves both modes from one gateway and never promises a free sandbox', async () => {
    const { resolveCanadaPostEnvironment } = await import('../src/lib/canadapost.js');
    const live = resolveCanadaPostEnvironment({ isTest: false });
    expect(live.mode).toBe('live');
    expect(live.hostname).toBe('api.canadapost-postescanada.ca');
    expect(live.baseUrl).toBe('https://api.canadapost-postescanada.ca');
    expect(live.label).toBe('Live Production Mode');

    const testEnv = resolveCanadaPostEnvironment({ isTest: true });
    expect(testEnv.mode).toBe('sandbox');
    expect(testEnv.label).toBe('Sandbox Test Mode');

    // The Developer Portal retired the ct.soa-gw / soa-gw split, so sandbox and
    // live now address the SAME host and only the credentials differ. The
    // description has to say so: it sits directly above the Buy Label button,
    // and it used to read "Nothing is charged and no label is valid for
    // mailing" while a production key charged a real account.
    expect(testEnv.baseUrl).toBe(live.baseUrl);
    expect(testEnv.hostname).toBe(live.hostname);
    expect(testEnv.sharedGateway).toBe(true);
    expect(testEnv.description).not.toMatch(/nothing is charged\.|no label is valid for mailing/i);
    expect(testEnv.description).toMatch(/same address/i);
    expect(testEnv.description).toMatch(/production key/i);
  });

  it('accepts 7 to 10 digit Canada Post customer numbers only', async () => {
    const { isValidCustomerNumber, normalizeCustomerNumber } = await import('../src/lib/canadapost.js');

    expect(isValidCustomerNumber('0007123456')).toBe(true);
    expect(isValidCustomerNumber('1234567')).toBe(true);
    expect(isValidCustomerNumber('123456')).toBe(false);
    expect(isValidCustomerNumber('12345678901')).toBe(false);
    expect(isValidCustomerNumber('')).toBe(false);

    expect(normalizeCustomerNumber('000 712-3456')).toBe('0007123456');
  });

  it('ships no built-in credentials, so an unconfigured account cannot buy a label', async () => {
    const {
      DEFAULT_CP_API_KEY,
      DEFAULT_CP_API_SECRET,
      DEFAULT_CP_CUSTOMER_NUMBER,
      hasCanadaPostCredentials,
      validateCanadaPostAccount
    } = await import('../src/lib/canadapost.js');

    // This bundle is served publicly; a credential here would be a published one.
    expect(DEFAULT_CP_API_KEY).toBe('');
    expect(DEFAULT_CP_API_SECRET).toBe('');
    expect(DEFAULT_CP_CUSTOMER_NUMBER).toBe('');
    expect(hasCanadaPostCredentials({ apiKey: '', apiSecret: '' })).toBe(false);
    expect(hasCanadaPostCredentials({ apiKey: 'k', apiSecret: '' })).toBe(false);
    expect(hasCanadaPostCredentials({ apiKey: 'k', apiSecret: 's' })).toBe(true);

    const unconfigured = validateCanadaPostAccount({ isTest: false });
    expect(unconfigured.ok).toBe(false);
    expect(unconfigured.configured).toBe(false);
    expect(unconfigured.errors.join(' ')).toMatch(/API key is missing/i);
    expect(unconfigured.errors.join(' ')).toMatch(/Tax Centre/i);

    const realLive = validateCanadaPostAccount({
      apiKey: 'merchant_key_abc',
      apiSecret: 'merchant_secret_xyz',
      customerNumber: '0042998877',
      isTest: false
    });
    expect(realLive.ok).toBe(true);
    expect(realLive.configured).toBe(true);
    expect(realLive.customerNumber).toBe('0042998877');
    expect(realLive.errors).toHaveLength(0);
  });

  it('flags a malformed customer number and warns while in sandbox mode', async () => {
    const { validateCanadaPostAccount } = await import('../src/lib/canadapost.js');

    const badCust = validateCanadaPostAccount({
      apiKey: 'merchant_key_abc',
      apiSecret: 'merchant_secret_xyz',
      customerNumber: '12345',
      isTest: false
    });
    expect(badCust.ok).toBe(false);
    expect(badCust.errors.join(' ')).toMatch(/7 to 10 digits/);

    const sandbox = validateCanadaPostAccount({
      apiKey: 'merchant_key_abc',
      apiSecret: 'merchant_secret_xyz',
      customerNumber: '0042998877',
      isTest: true
    });
    expect(sandbox.ok).toBe(true);
    // Warn about what is actually true: the gateway is shared, so only a
    // development key makes this a test.
    const sandboxWarning = sandbox.warnings.join(' ');
    expect(sandboxWarning).toMatch(/same address/i);
    expect(sandboxWarning).toMatch(/development key/i);
    expect(sandboxWarning).toMatch(/charges your account/i);
  });
});

// Create Shipment is `POST /{mailedBy}/{mobo}/shipments` on the Developer
// Portal gateway. For a single merchant, mobo is the billing customer number
// again — so both segments are the same number in these tests.
const SHIPMENT_ENDPOINT = 'https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/0042998877/0042998877/shipments';

describe('Canada Post Shipment Simulation Guardrail', () => {
  const realCreds = {
    apiKey: 'merchant_key_abc',
    apiSecret: 'merchant_secret_xyz',
    customerNumber: '0042998877'
  };

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  it('never invents a tracking PIN for a live shipment when the gateway is unreachable', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await expect(executeCanadaPostProxy({
      targetEndpoint: 'https://api.canadapost-postescanada.ca/rs/0042998877/ncshipment',
      jsonPayload: '{"nonContractShipment":{}}',
      ...realCreds,
      isTest: false
    })).rejects.toThrow(/no label was purchased/i);
  });

  it('still simulates a shipment in sandbox mode and marks it as simulated', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await executeCanadaPostProxy({
      targetEndpoint: 'https://api.canadapost-postescanada.ca/rs/0042998877/ncshipment',
      jsonPayload: '{"nonContractShipment":{}}',
      ...realCreds,
      isTest: true
    });

    expect(result.isSimulated).toBe(true);
    expect(result.trackingPin).toBeTruthy();
    expect(result.simulationReason).toMatch(/Failed to fetch/);
  });

  it('refuses to buy a label with no credentials configured, before any network call', async () => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('should never be called'));

    await expect(buyCanadaPostLabel({
      serviceCode: 'DOM.EP',
      destination: { countryCode: 'CA', postalCode: 'V6B2W9', address1: '1 Main St', city: 'Vancouver' },
      parcel: { weightKg: 0.5 },
      isTest: false
    })).rejects.toThrow(/API key is missing/i);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not simulate a shipment outside sandbox mode even with no credentials', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await expect(executeCanadaPostProxy({
      targetEndpoint: 'https://api.canadapost-postescanada.ca/rs/0042998877/ncshipment',
      jsonPayload: '{"nonContractShipment":{}}',
      isTest: false
    })).rejects.toThrow(/no label was purchased/i);
  });

  it('routes a purchase through the documented Shipping API endpoint', async () => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');
    const successJson = JSON.stringify({
      "nonContractShipmentInfo": {
        "shipmentId": "406951321983787352",
        "trackingPin": "70123456789012345",
        "links": {
          "link": [
            { "@rel": "label", "@href": "https://soa-gw.canadapost.ca/rs/artifact/abc/10000/0" }
          ]
        }
      }
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, json: successJson }),
      text: async () => successJson,
      headers: { get: () => 'application/json' }
    });

    const result = await buyCanadaPostLabel({
      serviceCode: 'USA.TP',
      sender: realSender,
      destination: { countryCode: 'US', postalCode: '90210', address1: '1 Palm Dr', city: 'Beverly Hills', state: 'CA' },
      parcel: { weightKg: 0.5 },
      declarationId: '0rd4dpkrvc1y9',
      ...realCreds,
      isTest: false
    });

    expect(result.trackingPin).toBe('70123456789012345');
    expect(result.isSimulated).toBe(false);
    expect(result.mode).toBe('live');
    expect(result.customerNumber).toBe('0042998877');

    const proxyCall = global.fetch.mock.calls[0];
    const proxyBody = JSON.parse(proxyCall[1].body);
    expect(proxyBody.targetEndpoint).toBe(SHIPMENT_ENDPOINT);
    expect(proxyBody.jsonPayload).toContain('"declarationId":"0rd4dpkrvc1y9"');
  });
});

describe('Purchased labels stay reprintable offline', () => {
  const realCreds = {
    apiKey: 'merchant_key_abc',
    apiSecret: 'merchant_secret_xyz',
    customerNumber: '0042998877'
  };

  const shipmentJson = pin => JSON.stringify({
    "nonContractShipmentInfo": {
      "shipmentId": `4069513219837873${pin.slice(-2)}`,
      "trackingPin": pin,
      "links": {
        "link": [
          { "@rel": "label", "@href": "https://soa-gw.canadapost.ca/rs/artifact/abc/10000/0" }
        ]
      }
    }
  });

  const buy = async (pin, orderNum) => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');
    const jsonStr = shipmentJson(pin);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, json: jsonStr }),
      text: async () => jsonStr,
      headers: { get: () => 'application/json' }
    });
    return buyCanadaPostLabel({
      serviceCode: 'DOM.EP',
      sender: realSender,
      orderNum,
      destination: { countryCode: 'CA', postalCode: 'V6B2W9', address1: '1 Main St', city: 'Vancouver' },
      parcel: { weightKg: 0.5 },
      ...realCreds,
      isTest: false
    });
  };

  let mockStore = {};
  const mockStorage = {
    getItem: (k) => mockStore[k] ?? null,
    setItem: (k, v) => { mockStore[k] = String(v); },
    removeItem: (k) => { delete mockStore[k]; },
    clear: () => { mockStore = {}; },
  };

  beforeEach(() => {
    mockStore = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
    mockStore = {};
  });

  it('keeps an earlier label reachable after a later one is bought', async () => {
    const { getArchivedShipmentContext, listArchivedShipments } = await import('../src/lib/canadapost.js');

    await buy('70123456789000001', 'ORD-1');
    await buy('70123456789000002', 'ORD-2');

    // The older parcel is the one that used to become unreachable.
    const older = getArchivedShipmentContext('70123456789000001');
    expect(older).toBeTruthy();
    expect(older.orderNum).toBe('ORD-1');

    const newer = getArchivedShipmentContext('7012 3456 7890 00002');
    expect(newer.orderNum).toBe('ORD-2');

    expect(listArchivedShipments().map(l => l.orderNum)).toEqual(['ORD-2', 'ORD-1']);
  });

  it('returns null for a parcel that was never bought here', async () => {
    const { getArchivedShipmentContext } = await import('../src/lib/canadapost.js');
    await buy('70123456789000001', 'ORD-1');
    expect(getArchivedShipmentContext('70123456789009999')).toBe(null);
  });

  it('offers a test-mode shipment for reprint, marked as one', async () => {
    const { executeCanadaPostProxy, setLastPurchasedShipmentContext, listArchivedShipments } =
      await import('../src/lib/canadapost.js');

    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const sim = await executeCanadaPostProxy({
      targetEndpoint: 'https://api.canadapost-postescanada.ca/rs/0042998877/ncshipment',
      jsonPayload: '{"nonContractShipment":{}}',
      ...realCreds,
      isTest: true
    });
    setLastPurchasedShipmentContext({ ...sim, orderNum: 'SIM-1' });

    // A test run is kept so the reprint path can be rehearsed, but it is
    // flagged, so it can never be shown as a label that was really bought.
    const listed = listArchivedShipments();
    expect(listed).toHaveLength(1);
    expect(listed[0].isSimulated).toBe(true);
    expect(listed[0].trackingPin).toBe(sim.trackingPin);
  });
});

describe('Zonos Verified Account key reaches Canada Post', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
    localStorage.clear();
  });

  it('sends the account key on the shipment request so Canada Post can issue the Declaration ID', async () => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');
    const jsonStr = JSON.stringify({
      "nonContractShipmentInfo": {
        "shipmentId": "1",
        "trackingPin": "70123456789012345",
        "declarationId": "0rd4dpkrvc1y9"
      }
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, json: jsonStr }),
      text: async () => jsonStr,
      headers: { get: () => 'application/json' }
    });

    const result = await buyCanadaPostLabel({
      serviceCode: 'USA.TP',
      sender: realSender,
      destination: { countryCode: 'US', postalCode: '90210', address1: '1 Palm Dr', city: 'Beverly Hills', state: 'CA' },
      parcel: { weightKg: 0.5 },
      apiKey: 'merchant_key_abc',
      apiSecret: 'merchant_secret_xyz',
      customerNumber: '0042998877',
      zonosAccountKey: 'credential_live_account_key',
      isTest: false
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.zonosAccountKey).toBe('credential_live_account_key');

    // Canada Post issued the ID; it must come back on the result rather than
    // being expected from the caller.
    expect(result.declarationId).toBe('0rd4dpkrvc1y9');
    expect(result.declarationIssuedByCarrier).toBe(true);
  });

  it('keeps a Declaration ID bought by hand when the carrier issues none', async () => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');
    const jsonStr = JSON.stringify({
      "nonContractShipmentInfo": {
        "shipmentId": "1",
        "trackingPin": "70123456789012345"
      }
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, json: jsonStr }),
      text: async () => jsonStr,
      headers: { get: () => 'application/json' }
    });

    const result = await buyCanadaPostLabel({
      serviceCode: 'USA.TP',
      sender: realSender,
      destination: { countryCode: 'US', postalCode: '90210', address1: '1 Palm Dr', city: 'Beverly Hills', state: 'CA' },
      parcel: { weightKg: 0.5 },
      declarationId: '0rcvxj2tkbnwr',
      apiKey: 'merchant_key_abc',
      apiSecret: 'merchant_secret_xyz',
      customerNumber: '0042998877',
      isTest: false
    });

    expect(result.declarationId).toBe('0rcvxj2tkbnwr');
    expect(result.declarationIssuedByCarrier).toBe(false);
  });

  it('ignores a malformed declaration id in the response', async () => {
    const { parseCanadaPostShipmentResponse } = await import('../src/lib/canadapost.js');
    const parsed = parseCanadaPostShipmentResponse(
      JSON.stringify({
        "nonContractShipment-info": {
          "shipmentId": "1",
          "trackingPin": "7012345678901",
          "declarationId": "NOT-AN-ID"
        }
      })
    );
    expect(parsed.declarationId).toBe('');
  });
});

describe('Canada Post Tracking PIN Verification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  it('parses a tracking summary into a shipment status record', async () => {
    const { parseCanadaPostTrackingSummary } = await import('../src/lib/canadapost.js');
    const jsonStr = JSON.stringify({
      trackingSummary: {
        pinSummary: {
          pin: '70123456789012345',
          originPostalId: 'M4B',
          destinationPostalId: 'V6B',
          serviceName: 'Expedited Parcel',
          eventDescription: 'Delivered',
          eventDateTime: '20260824:101500',
          eventLocation: 'VANCOUVER, BC',
          expectedDeliveryDate: '2026-08-25',
          actualDeliveryDate: '2026-08-24'
        }
      }
    });

    const parsed = parseCanadaPostTrackingSummary(jsonStr);
    expect(parsed.found).toBe(true);
    expect(parsed.pin).toBe('70123456789012345');
    expect(parsed.status).toBe('Delivered');
    expect(parsed.serviceName).toBe('Expedited Parcel');
    expect(parsed.expectedDeliveryDate).toBe('2026-08-25');
  });

  it('surfaces a Canada Post error document rather than reporting a phantom shipment', async () => {
    const { parseCanadaPostTrackingSummary } = await import('../src/lib/canadapost.js');
    const errJson = JSON.stringify({
      messages: {
        message: {
          code: '004',
          description: 'No Pin History'
        }
      }
    });

    expect(() => parseCanadaPostTrackingSummary(errJson)).toThrow(/No Pin History/);
    expect(() => parseCanadaPostTrackingSummary('')).toThrow(/Empty response/);
  });

  it('verifies a tracking PIN against the correct environment endpoint', async () => {
    const { verifyCanadaPostTrackingPin } = await import('../src/lib/canadapost.js');
    const jsonStr = JSON.stringify({ trackingSummary: { pinSummary: { pin: '70123456789012345', eventDescription: 'In Transit' } } });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, json: jsonStr }),
      text: async () => jsonStr
    });

    const result = await verifyCanadaPostTrackingPin({
      pin: '7012 3456 7890 12345',
      apiKey: 'merchant_key_abc',
      apiSecret: 'merchant_secret_xyz',
      isTest: false
    });

    expect(result.found).toBe(true);
    expect(result.status).toBe('In Transit');
    expect(result.environment.mode).toBe('live');
    expect(global.fetch.mock.calls[0][0]).toContain('/api/canadapost/track?pin=70123456789012345');
  });

  it('requires a tracking PIN', async () => {
    const { verifyCanadaPostTrackingPin } = await import('../src/lib/canadapost.js');
    await expect(verifyCanadaPostTrackingPin({ pin: '' })).rejects.toThrow(/required/i);
  });
});

describe('Canada Post authentication routing', () => {
  it('uses HTTP Basic for the Web Services gateways regardless of key shape', async () => {
    const { resolveCanadaPostAuthStrategy } = await import('../src/lib/canadapost.js');
    // A 32-char hex string is a perfectly ordinary Developer Program API
    // username; it must not be mistaken for an OAuth client ID.
    expect(resolveCanadaPostAuthStrategy('https://soa-gw.canadapost.ca/rs/ship/price')).toBe('basic');
    expect(resolveCanadaPostAuthStrategy('https://ct.soa-gw.canadapost.ca/rs/ship/price')).toBe('basic');
    expect(resolveCanadaPostAuthStrategy('https://soa-gw.canadapost.ca/vis/tracking/pin/123/summary')).toBe('basic');
  });

  it('uses OAuth only for the Developer Portal host, or when asked explicitly', async () => {
    const { resolveCanadaPostAuthStrategy } = await import('../src/lib/canadapost.js');
    expect(resolveCanadaPostAuthStrategy('https://api.canadapost-postescanada.ca/rating/v1/quote')).toBe('oauth');
    expect(resolveCanadaPostAuthStrategy('https://soa-gw.canadapost.ca/rs/ship/price', { authType: 'oauth' })).toBe('oauth');
    expect(resolveCanadaPostAuthStrategy('https://api.canadapost-postescanada.ca/x', { authType: 'basic' })).toBe('basic');
  });
});

describe('Canada Post failure reporting', () => {
  it('explains a rejected credential instead of reporting an empty response', async () => {
    const { describeCanadaPostFailure } = await import('../src/lib/canadapost.js');
    const msg = describeCanadaPostFailure({ status: 401, body: '', isTest: false });
    expect(msg).toMatch(/401/);
    expect(msg).toMatch(/Sandbox Environment toggle/i);
    expect(msg).not.toMatch(/empty response/i);
  });

  it('separates a missing entitlement from a bad password', async () => {
    const { describeCanadaPostFailure } = await import('../src/lib/canadapost.js');
    expect(describeCanadaPostFailure({ status: 403 })).toMatch(/entitlement|refused this request/i);
    expect(describeCanadaPostFailure({ status: 503 })).toMatch(/outage on their side/i);
  });

  it('prefers Canada Post’s own error document when one is present', async () => {
    const { describeCanadaPostFailure } = await import('../src/lib/canadapost.js');
    const xml = '<messages><message><code>E002</code><description>Authentication Failure</description></message></messages>';
    expect(describeCanadaPostFailure({ status: 400, body: xml })).toBe('Canada Post [E002]: Authentication Failure');
  });
});

describe('Proxy failures reach the publisher instead of being swallowed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  it('reports a 401 relayed by the Apps Script proxy rather than a parse error', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    localStorage.setItem('lm-sheets-url', 'https://script.google.com/macros/s/real/exec');

    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/')) throw new Error('Failed to fetch');
      const envelope = { ok: false, status: 401, xml: '' };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(envelope),
        json: async () => envelope
      };
    });

    await expect(executeCanadaPostProxy({
      targetEndpoint: 'https://soa-gw.canadapost.ca/rs/ship/price',
      xmlPayload: '<mailingScenario/>',
      apiKey: 'cc42b40f9036917c8e2fd928c65df5de',
      apiSecret: 'secret',
      isTest: false
    })).rejects.toThrow(/401/);

    localStorage.removeItem('lm-sheets-url');
  });

  it('does not simulate a sandbox shipment that Canada Post actually refused', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/')) throw new Error('Failed to fetch');
      return { ok: false, status: 403, text: async () => '', json: async () => { throw new Error('not json'); } };
    });

    await expect(executeCanadaPostProxy({
      targetEndpoint: 'https://ct.soa-gw.canadapost.ca/rs/0042998877/ncshipment',
      xmlPayload: '<nonContractShipment/>',
      apiKey: 'key',
      apiSecret: 'secret',
      isTest: true
    })).rejects.toThrow(/403/);
  });

  it('walks past a static host that has no local proxy', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    const priceJson = JSON.stringify({ priceQuotes: { priceQuote: { serviceCode: 'DOM.EP', priceDetails: { base: 12.00, due: 13.56 } } } });

    global.fetch = vi.fn(async (url) => {
      // GitHub Pages answers an unknown path with an HTML 404 page.
      if (String(url).startsWith('/api/')) {
        return {
          ok: false,
          status: 404,
          text: async () => '<!doctype html><html>404</html>',
          json: async () => { throw new Error('not json'); }
        };
      }
      return { ok: true, status: 200, text: async () => priceJson };
    });

    const result = await executeCanadaPostProxy({
      targetEndpoint: 'https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/rating/v1/prices',
      jsonPayload: '{"mailingScenario":{}}',
      apiKey: 'key',
      apiSecret: 'secret',
      isTest: false
    });
    expect(result.ok).toBe(true);
    expect(result.json).toContain('DOM.EP');
  });

  it('never puts the API secret in the label-download URL', async () => {
    const { fetchCanadaPostLabelBlob } = await import('../src/lib/canadapost.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await fetchCanadaPostLabelBlob({
      labelUrl: 'https://soa-gw.canadapost.ca/rs/artifact/abc/10000/0',
      apiKey: 'key',
      apiSecret: 'super-secret-password',
      shipmentContext: { trackingPin: '70123456789012345', sender: { name: 'X' }, destination: { name: 'Y' } }
    });

    for (const call of global.fetch.mock.calls) {
      expect(String(call[0])).not.toContain('super-secret-password');
    }
  });
});

describe('Canada Post credential inspection', () => {
  it('strips hidden characters that survive trim and break authentication', async () => {
    const { sanitizeCanadaPostCredential } = await import('../src/lib/canadapost.js');
    // A zero-width space pasted into the middle of a key is invisible on
    // screen but makes Canada Post answer E002.
    const dirty = '1ed63baea​3162824ee820aa20130a893 ';
    const result = sanitizeCanadaPostCredential(dirty);
    expect(result.value).toBe('1ed63baea3162824ee820aa20130a893');
    expect(result.issues).toContain('invisible');
    expect(result.issues).toContain('padded');
  });

  it('leaves a clean credential completely untouched', async () => {
    const { sanitizeCanadaPostCredential } = await import('../src/lib/canadapost.js');
    const result = sanitizeCanadaPostCredential('1ed63baea3162824ee820aa20130a893');
    expect(result.value).toBe('1ed63baea3162824ee820aa20130a893');
    expect(result.issues).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it('catches a key and password pasted together as one value', async () => {
    const { inspectCanadaPostCredentials } = await import('../src/lib/canadapost.js');
    const { findings } = inspectCanadaPostCredentials({ apiKey: '6e93d5:0bfa9f', apiSecret: 'x' });
    expect(findings.join(' ')).toMatch(/colon/i);
  });

  it('passes a well-formed key and password with nothing to report', async () => {
    const { inspectCanadaPostCredentials } = await import('../src/lib/canadapost.js');
    // A Developer Program username — the half before the colon of the key
    // Canada Post issues. A bare 32-hex string is a Developer Portal client
    // ID instead, and is reported as such rather than passed as clean.
    const result = inspectCanadaPostCredentials({
      apiKey: '6e93d53968881714',
      apiSecret: 'b2c4d6e8f0a1b3c5d7e9f1',
      customerNumber: '0001298882'
    });
    expect(result.ok).toBe(true);
    expect(result.keyKind).toBe('legacy');
    expect(result.customerNumber).toBe('0001298882');
  });
});

describe('Canada Post connection diagnosis', () => {
  const creds = { apiKey: '1ed63baea3162824ee820aa20130a893', apiSecret: 'aSecretFromTheDeveloperPortal' };
  const authError = () => { throw new Error('Canada Post [E002]: AAA Authentication Failure'); };

  it('identifies a development key being used against the live gateway', async () => {
    const { diagnoseCanadaPostConnection } = await import('../src/lib/canadapost.js');
    const result = await diagnoseCanadaPostConnection({
      ...creds,
      customerNumber: '0001298882',
      isTest: false,
      probe: async ({ sandbox }) => {
        if (!sandbox) authError();
        return [{ serviceCode: 'DOM.EP' }, { serviceCode: 'DOM.RP' }];
      }
    });
    expect(result.verdict).toBe('wrong-settings');
    expect(result.steps.join(' ')).toMatch(/Sandbox Environment toggle ON/);
  });

  it('identifies a customer number the key is not entitled to', async () => {
    const { diagnoseCanadaPostConnection } = await import('../src/lib/canadapost.js');
    const result = await diagnoseCanadaPostConnection({
      ...creds,
      customerNumber: '0001298882',
      isTest: false,
      probe: async ({ withCustomer }) => {
        if (withCustomer) authError();
        return [{ serviceCode: 'DOM.EP' }];
      }
    });
    expect(result.verdict).toBe('wrong-settings');
    expect(result.steps.join(' ')).toMatch(/Clear the customer number \(0001298882\)/);
  });

  it('says plainly when the key itself is refused everywhere', async () => {
    const { diagnoseCanadaPostConnection } = await import('../src/lib/canadapost.js');
    const result = await diagnoseCanadaPostConnection({
      apiKey: '1ed63baea3162824ee820aa20130a893', // Use a portal key to trigger auth failure
      apiSecret: 'aSecretFromTheDeveloperPortal',
      customerNumber: '0001298882',
      isTest: false,
      probe: async () => authError()
    });
    expect(result.verdict).toBe('bad-credentials');
    expect(result.attempts).toHaveLength(4);
    expect(result.steps.join(' ')).toMatch(/Developer Portal/);
  });

  it('reports success without asking the owner to change anything', async () => {
    const { diagnoseCanadaPostConnection } = await import('../src/lib/canadapost.js');
    const result = await diagnoseCanadaPostConnection({
      ...creds,
      customerNumber: '0001298882',
      isTest: false,
      probe: async () => [{ serviceCode: 'DOM.EP' }, { serviceCode: 'DOM.XP' }]
    });
    expect(result.ok).toBe(true);
    expect(result.verdict).toBe('working');
    expect(result.steps).toEqual([]);
    expect(result.attempts).toHaveLength(1);
  });

  it('does not blame the credentials for a non-authentication failure', async () => {
    const { diagnoseCanadaPostConnection } = await import('../src/lib/canadapost.js');
    const result = await diagnoseCanadaPostConnection({
      ...creds,
      isTest: false,
      probe: async () => { throw new Error('Canada Post [9999]: Postal code is invalid'); }
    });
    expect(result.verdict).toBe('other-failure');
    expect(result.steps.join(' ')).toMatch(/Postal code is invalid/);
  });

  it('sanitizes the credentials before probing with them', async () => {
    const { diagnoseCanadaPostConnection } = await import('../src/lib/canadapost.js');
    const seen = [];
    await diagnoseCanadaPostConnection({
      apiKey: ' 1ed63baea3162824ee820aa20130a893 ',
      apiSecret: ' secret﻿value ',
      isTest: false,
      probe: async () => { seen.push('called'); return [{ serviceCode: 'DOM.EP' }]; }
    });
    const { inspectCanadaPostCredentials } = await import('../src/lib/canadapost.js');
    const insp = inspectCanadaPostCredentials({ apiKey: ' 1ed63baea3162824ee820aa20130a893 ', apiSecret: ' secret﻿value ' });
    expect(insp.apiKey.value).toBe('1ed63baea3162824ee820aa20130a893');
    expect(insp.apiSecret.value).toBe('secretvalue');
    expect(seen).toHaveLength(1);
  });
});

describe('Canada Post key system detection', () => {
  it('recognises a Developer Portal client ID, which this app cannot use', async () => {
    const { classifyCanadaPostKeyKind } = await import('../src/lib/canadapost.js');
    expect(classifyCanadaPostKeyKind('1ed63baea3162824ee820aa20130a893')).toBe('portal-client-id');
    expect(classifyCanadaPostKeyKind('cc42b40f9036917c8e2fd928c65df5de')).toBe('portal-client-id');
  });

  it('recognises a Developer Program key still joined to its password', async () => {
    const { classifyCanadaPostKeyKind } = await import('../src/lib/canadapost.js');
    expect(classifyCanadaPostKeyKind('6e93d53968881714:0bfa9fcb9853d1f51ee57a')).toBe('legacy-combined');
  });

  it('splits a whole key:password paste into its two halves', async () => {
    const { splitCanadaPostApiKey } = await import('../src/lib/canadapost.js');
    const pair = splitCanadaPostApiKey('6e93d53968881714:0bfa9fcb9853d1f51ee57a', '');
    expect(pair).toEqual({
      apiKey: '6e93d53968881714',
      apiSecret: '0bfa9fcb9853d1f51ee57a',
      split: true
    });
  });

  it('leaves an already-separated key and password alone', async () => {
    const { splitCanadaPostApiKey } = await import('../src/lib/canadapost.js');
    const pair = splitCanadaPostApiKey('6e93d53968881714', '0bfa9fcb9853d1f51ee57a');
    expect(pair.split).toBe(false);
    expect(pair.apiKey).toBe('6e93d53968881714');
    expect(pair.apiSecret).toBe('0bfa9fcb9853d1f51ee57a');
  });

  it('tells the owner they have the wrong kind of key rather than to re-check the password', async () => {
    const { diagnoseCanadaPostConnection } = await import('../src/lib/canadapost.js');
    const result = await diagnoseCanadaPostConnection({
      apiKey: '6e93d53968881714',
      apiSecret: '0bfa9fcb9853d1f51ee57a',
      customerNumber: '0001298882',
      isTest: false,
      probe: async () => { throw new Error('Canada Post [E002]: AAA Authentication Failure'); }
    });
    expect(result.verdict).toBe('wrong-key-system');
    expect(result.steps.join(' ')).toMatch(/retired its older/);
  });

  it('still reports a plain bad password as a bad password', async () => {
    const { diagnoseCanadaPostConnection } = await import('../src/lib/canadapost.js');
    const result = await diagnoseCanadaPostConnection({
      apiKey: '1ed63baea3162824ee820aa20130a893',
      apiSecret: 'wrongpassword',
      isTest: false,
      probe: async () => { throw new Error('Canada Post [E002]: AAA Authentication Failure'); }
    });
    expect(result.verdict).toBe('bad-credentials');
    expect(result.steps.join(' ')).toMatch(/App credentials page/);
  });

  it('diagnoses a whole key:password paste by testing its split halves', async () => {
    const { diagnoseCanadaPostConnection } = await import('../src/lib/canadapost.js');
    const seen = [];
    const result = await diagnoseCanadaPostConnection({
      apiKey: '1ed63baea3162824ee820aa20130a893:aSecretFromTheDeveloperPortal',
      apiSecret: '',
      isTest: false,
      probe: async () => { seen.push(1); return [{ serviceCode: 'DOM.EP' }]; }
    });
    expect(result.keySplit).toBe(true);
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
  });
});

describe('A Google Sheet relay that answers with a web page is reported, not hidden', () => {
  // Match the relay by exact hostname, never by substring: a URL merely
  // containing the host (in a query string, say) is not the relay.
  const isSheetsUrl = (url) => {
    try {
      return new URL(String(url), 'http://localhost').hostname === 'script.google.com';
    } catch (_) {
      return false;
    }
  };

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
    localStorage.removeItem('lm-sheets-url');
  });

  const signInPage = '<!doctype html><html><head><title>Sign in - Google Accounts</title></head>' +
    '<body><form action="https://accounts.google.com/ServiceLogin">Sign in</form></body></html>';

  it('names the deployment problem instead of blaming browser CORS', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    localStorage.setItem('lm-sheets-url', 'https://script.google.com/macros/s/real/exec');

    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/')) throw new Error('Failed to fetch');
      if (isSheetsUrl(url)) {
        return { ok: true, status: 200, text: async () => signInPage };
      }
      throw new Error('Failed to fetch');
    });

    await expect(executeCanadaPostProxy({
      targetEndpoint: 'https://soa-gw.canadapost.ca/rs/ship/price',
      xmlPayload: '<mailingScenario/>',
      apiKey: 'key',
      apiSecret: 'secret',
      isTest: false
    })).rejects.toThrow(/sign-in page|Who has access/i);
  });

  it('does not tell the owner to connect a sheet that is already connected', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    localStorage.setItem('lm-sheets-url', 'https://script.google.com/macros/s/real/exec');

    global.fetch = vi.fn(async (url) => {
      if (isSheetsUrl(url)) {
        return { ok: true, status: 200, text: async () => signInPage };
      }
      throw new Error('Failed to fetch');
    });

    const err = await executeCanadaPostProxy({
      targetEndpoint: 'https://soa-gw.canadapost.ca/rs/ship/price',
      xmlPayload: '<mailingScenario/>',
      apiKey: 'key',
      apiSecret: 'secret',
      isTest: false
    }).catch(e => e);

    expect(err.message).not.toMatch(/ensure your Google Sheet is connected/i);
  });

  it('still keeps walking past a static host that has no local backend', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    const priceXml = '<priceQuotes><priceQuote><serviceCode>DOM.EP</serviceCode></priceQuote></priceQuotes>';

    global.fetch = vi.fn(async (url) => {
      // GitHub Pages answers an unknown path with an HTML 404 — expected here,
      // and must not be reported as a relay failure.
      if (String(url).startsWith('/api/')) {
        return { ok: false, status: 404, text: async () => '<!doctype html><html>404</html>' };
      }
      return { ok: true, status: 200, text: async () => priceXml };
    });

    const result = await executeCanadaPostProxy({
      targetEndpoint: 'https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/rating/v1/prices',
      jsonPayload: '{"mailingScenario":{}}',
      apiKey: 'key',
      apiSecret: 'secret',
      isTest: false
    });
    expect(result.ok).toBe(true);
    expect(result.json).toContain('DOM.EP');
  });

  it('keeps the original advice when no sheet is configured at all', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await expect(executeCanadaPostProxy({
      targetEndpoint: 'https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/rating/v1/prices',
      jsonPayload: '{"mailingScenario":{}}',
      apiKey: 'key',
      apiSecret: 'secret',
      isTest: false
    })).rejects.toThrow(/ensure your Google Sheet is connected/i);
  });

  it('relays a real Canada Post answer through the sheet unchanged', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    localStorage.setItem('lm-sheets-url', 'https://script.google.com/macros/s/real/exec');
    const priceJson = JSON.stringify({ priceQuotes: { priceQuote: { serviceCode: 'DOM.EP' } } });

    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/')) throw new Error('Failed to fetch');
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true, status: 200, authMode: 'oauth2', json: priceJson })
      };
    });

    const result = await executeCanadaPostProxy({
      targetEndpoint: 'https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/rating/v1/prices',
      jsonPayload: '{"mailingScenario":{}}',
      apiKey: 'key',
      apiSecret: 'secret',
      isTest: false
    });
    expect(result.json).toContain('DOM.EP');
  });

  it('describes each way an Apps Script deployment goes wrong', async () => {
    const { describeAppsScriptProxyFailure } = await import('../src/lib/canadapost.js');
    expect(describeAppsScriptProxyFailure({ kind: 'not-json', body: signInPage })).toMatch(/Who has access/i);
    expect(describeAppsScriptProxyFailure({ kind: 'not-json', body: '<html>TypeError: x is not a function</html>' }))
      .toMatch(/older version|redeploy/i);
    expect(describeAppsScriptProxyFailure({ kind: 'empty', body: '' })).toMatch(/empty response/i);
    expect(describeAppsScriptProxyFailure({ kind: 'not-json', body: '<!doctype html><html>Moved</html>' }))
      .toMatch(/\/exec|out of date/i);
  });
});

describe('Commercial rates that come back empty fall back to retail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
    localStorage.removeItem('lm-sheets-url');
  });

  const usQuotes = JSON.stringify({
    priceQuotes: {
      priceQuote: [
        { serviceCode: 'USA.TP', serviceName: 'Tracked Packet - USA', priceDetails: { base: 22.4, due: 24.1 } },
        { serviceCode: 'USA.XP', serviceName: 'Xpresspost - USA', priceDetails: { base: 48.0, due: 51.2 } }
      ]
    }
  });
  const noQuotes = JSON.stringify({ priceQuotes: { priceQuote: [] } });

  const relay = (bodies) => {
    let call = 0;
    return vi.fn(async (url) => {
      if (String(url).startsWith('/api/')) throw new Error('Failed to fetch');
      const body = bodies[Math.min(call, bodies.length - 1)];
      call += 1;
      return { ok: true, status: 200, text: async () => body };
    });
  };

  it('asks for commercial first when a customer number is set', async () => {
    const { getCanadaPostRates } = await import('../src/lib/canadapost.js');
    const sent = [];
    global.fetch = vi.fn(async (url, opts) => {
      if (String(url).startsWith('/api/')) {
        sent.push(JSON.parse(JSON.parse(opts.body).jsonPayload || '{}'));
        throw new Error('Failed to fetch');
      }
      return { ok: true, status: 200, text: async () => usQuotes };
    });

    const quotes = await getCanadaPostRates({
      destCountry: 'US', destPostalOrZip: '10009',
      apiKey: 'k', apiSecret: 's', customerNumber: '0001298882', isTest: false
    });
    expect(quotes[0].quoteType).toBe('commercial');
  });

  it('retries as a counter quote when the commercial one returns nothing', async () => {
    const { getCanadaPostRates } = await import('../src/lib/canadapost.js');
    // This is the reported symptom: a US route on an account with no US
    // contract answers 200 with an empty list, which used to surface as
    // "no services found" and nothing else.
    global.fetch = relay([noQuotes, usQuotes]);

    const quotes = await getCanadaPostRates({
      destCountry: 'US', destPostalOrZip: '10009',
      apiKey: 'k', apiSecret: 's', customerNumber: '0001298882', isTest: false
    });

    expect(quotes).toHaveLength(2);
    expect(quotes[0].serviceCode).toBe('USA.TP');
    expect(quotes.every(q => q.quoteType === 'counter')).toBe(true);
    expect(quotes.every(q => q.commercialUnavailable)).toBe(true);
  });

  it('does not make a second request when commercial already worked', async () => {
    const { getCanadaPostRates } = await import('../src/lib/canadapost.js');
    let gatewayCalls = 0;
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/')) throw new Error('Failed to fetch');
      gatewayCalls += 1;
      return { ok: true, status: 200, text: async () => usQuotes };
    });

    await getCanadaPostRates({
      destCountry: 'US', destPostalOrZip: '10009',
      apiKey: 'k', apiSecret: 's', customerNumber: '0001298882', isTest: false
    });
    expect(gatewayCalls).toBe(1);
  });

  it('returns an honest empty list when neither quote type has services', async () => {
    const { getCanadaPostRates } = await import('../src/lib/canadapost.js');
    global.fetch = relay([noQuotes, noQuotes]);

    const quotes = await getCanadaPostRates({
      destCountry: 'US', destPostalOrZip: '10009',
      apiKey: 'k', apiSecret: 's', customerNumber: '0001298882', isTest: false
    });
    expect(quotes).toEqual([]);
  });

  it('asks for counter directly when there is no customer number', async () => {
    const { getCanadaPostRates } = await import('../src/lib/canadapost.js');
    let gatewayCalls = 0;
    global.fetch = vi.fn(async (url) => {
      if (String(url).startsWith('/api/')) throw new Error('Failed to fetch');
      gatewayCalls += 1;
      return { ok: true, status: 200, text: async () => usQuotes };
    });

    const quotes = await getCanadaPostRates({
      destCountry: 'US', destPostalOrZip: '10009',
      apiKey: 'k', apiSecret: 's', customerNumber: '', isTest: false
    });
    expect(gatewayCalls).toBe(1);
    expect(quotes.every(q => q.quoteType === 'counter')).toBe(true);
  });
});

describe('Rate payloads obey the gateway’s strict schema', () => {
  it('sends only camelCase keys, never hyphenated variants', async () => {
    const { buildRateScenarioJson } = await import('../src/lib/canadapost.js');
    // The Apigee gateway validates with additionalProperties:false, so a
    // defensive hyphenated key alongside the camelCase one is a 400.
    const payload = buildRateScenarioJson({
      destCountry: 'US', destPostalOrZip: '10009', customerNumber: '0001298882', contractId: '4299100'
    });
    expect(payload).not.toMatch(/"[a-z]+-[a-z]/);
    const parsed = JSON.parse(payload);
    expect(parsed.parcelCharacteristics).toBeTruthy();
    expect(parsed.originPostalCode).toBeTruthy();
    expect(parsed.destination.unitedStates.zipCode).toBe('10009');
  });

  it('omits the customer and contract entirely on a counter quote', async () => {
    const { buildRateScenarioJson } = await import('../src/lib/canadapost.js');
    // Rule 9114: counter rates are refused if either is present.
    const parsed = JSON.parse(buildRateScenarioJson({
      destCountry: 'US', destPostalOrZip: '10009',
      customerNumber: '0001298882', contractId: '4299100', quoteType: 'counter'
    }));
    expect(parsed.quoteType).toBe('counter');
    expect('customerNumber' in parsed).toBe(false);
    expect('contractId' in parsed).toBe(false);
  });

  it('never sends a contract id without its customer number', async () => {
    const { buildRateScenarioJson } = await import('../src/lib/canadapost.js');
    const parsed = JSON.parse(buildRateScenarioJson({
      destCountry: 'CA', destPostalOrZip: 'V6B2W9', customerNumber: '', contractId: '4299100'
    }));
    expect('contractId' in parsed).toBe(false);
  });
});

describe('Developer Portal error documents are read, not skipped', () => {
  it('reads the documented flat messages array', async () => {
    const { parseCanadaPostPriceQuotes } = await import('../src/lib/canadapost.js');
    // The Portal shape is {"messages":[{code,description}]}. Only the legacy
    // nested messages.message was checked, so this fell through every branch
    // and surfaced as an empty service list instead of the actual reason.
    const body = JSON.stringify({
      messages: [{ code: '9113', description: 'Please specify your customer number.' }]
    });
    expect(() => parseCanadaPostPriceQuotes(body)).toThrow(/9113/);
    expect(() => parseCanadaPostPriceQuotes(body)).toThrow(/specify your customer number/i);
  });

  it('still reads the legacy nested shape', async () => {
    const { parseCanadaPostPriceQuotes } = await import('../src/lib/canadapost.js');
    const body = JSON.stringify({
      messages: { message: { code: 'E002', description: 'AAA Authentication Failure' } }
    });
    expect(() => parseCanadaPostPriceQuotes(body)).toThrow(/E002/);
  });

  it('keeps every message when Canada Post sends more than one', async () => {
    const { parseCanadaPostPriceQuotes } = await import('../src/lib/canadapost.js');
    const body = JSON.stringify({
      messages: [
        { code: '7007', description: 'The weight value is invalid.' },
        { code: '1722', description: 'The options are invalid for the selected Service.' }
      ]
    });
    let thrown;
    try { parseCanadaPostPriceQuotes(body); } catch (e) { thrown = e; }
    expect(thrown.canadaPostCode).toBe('7007');
    expect(thrown.additionalMessages).toEqual(['[1722] The options are invalid for the selected Service.']);
  });

  it('does not mistake a successful quote list for an error', async () => {
    const { parseCanadaPostPriceQuotes } = await import('../src/lib/canadapost.js');
    const body = JSON.stringify({
      priceQuotes: { priceQuote: [{ serviceCode: 'USA.TP', priceDetails: { base: 12, due: 13.5 } }] }
    });
    const quotes = parseCanadaPostPriceQuotes(body);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].serviceCode).toBe('USA.TP');
  });
});

describe('A gateway timeout is not reported as a confirmed outage', () => {
  it('describes 504 as possibly a refused request', async () => {
    const { describeCanadaPostFailure } = await import('../src/lib/canadapost.js');
    const msg = describeCanadaPostFailure({ status: 504 });
    expect(msg).toMatch(/504/);
    expect(msg).toMatch(/refused|retrying/i);
    expect(msg).not.toMatch(/not a problem with your key/i);
  });

  it('still calls a 503 what it is', async () => {
    const { describeCanadaPostFailure } = await import('../src/lib/canadapost.js');
    expect(describeCanadaPostFailure({ status: 503 })).toMatch(/outage on their side/i);
  });
});
