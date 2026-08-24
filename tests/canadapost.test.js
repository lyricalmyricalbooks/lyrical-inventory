import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cleanPostalCode,
  buildRateScenarioXml,
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

  it('builds valid domestic XML mailing scenario payload', () => {
    const xml = buildRateScenarioXml({
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

    expect(xml).toContain('<origin-postal-code>M4B1B3</origin-postal-code>');
    expect(xml).toContain('<postal-code>V6B2W9</postal-code>');
    expect(xml).toContain('<weight>0.850</weight>');
    expect(xml).toContain('<length>23.0</length>');
    expect(xml).toContain('<width>19.5</width>');
    expect(xml).toContain('<height>2.0</height>');
    expect(xml).toContain('<customer-number>0007123456</customer-number>');
    expect(xml).toContain('<contract-id>4299100</contract-id>');
  });

  it('builds valid US and International XML destinations', () => {
    const usXml = buildRateScenarioXml({
      destCountry: 'US',
      destPostalOrZip: '90210'
    });
    expect(usXml).toContain('<united-states><zip-code>90210</zip-code></united-states>');

    const intXml = buildRateScenarioXml({
      destCountry: 'GB'
    });
    expect(intXml).toContain('<international><country-code>GB</country-code></international>');
  });
});

describe('Canada Post Price Quotes Parser', () => {
  const sampleXmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<price-quotes xmlns="http://www.canadapost.ca/ws/ship/rate-v4">
  <price-quote>
    <service-code>DOM.RP</service-code>
    <service-name>Regular Parcel</service-name>
    <price-details>
      <base>12.45</base>
      <due>14.07</due>
      <taxes>
        <gst>0.62</gst>
        <pst>1.00</pst>
      </taxes>
    </price-details>
    <service-standard>
      <expected-transit-time>5</expected-transit-time>
      <expected-delivery-date>2026-08-28</expected-delivery-date>
    </service-standard>
  </price-quote>
  <price-quote>
    <service-code>DOM.XP</service-code>
    <service-name>Xpresspost</service-name>
    <price-details>
      <base>18.50</base>
      <due>20.91</due>
      <taxes>
        <hst>2.41</hst>
      </taxes>
    </price-details>
    <service-standard>
      <expected-transit-time>2</expected-transit-time>
      <expected-delivery-date>2026-08-25</expected-delivery-date>
    </service-standard>
  </price-quote>
</price-quotes>`;

  it('parses XML price quotes into sorted rate objects', () => {
    const quotes = parseCanadaPostPriceQuotes(sampleXmlResponse);
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
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<messages xmlns="http://www.canadapost.ca/ws/messages">
  <message>
    <code>E002</code>
    <description>AAA Authentication Failure</description>
  </message>
</messages>`;

    expect(() => parseCanadaPostPriceQuotes(errorXml)).toThrow('Canada Post [E002]: AAA Authentication Failure');
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
  it('builds valid Non-Contract Shipment XML with sender, recipient, and customs', async () => {
    const { buildNonContractShipmentXml } = await import('../src/lib/canadapost.js');
    const xml = buildNonContractShipmentXml({
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

    expect(xml).toContain('<service-code>USA.TP</service-code>');
    expect(xml).toContain('<postal-zip-code>M4B1B3</postal-zip-code>');
    expect(xml).toContain('<country-code>US</country-code>');
    expect(xml).toContain('<postal-zip-code>10001</postal-zip-code>');
    expect(xml).toContain('<customs-description>Hardcover poetry books</customs-description>');
    expect(xml).toContain('<hs-tariff-code>490199</hs-tariff-code>');
    expect(xml).toContain('<customer-ref-1>ORD-2026-99</customer-ref-1>');
  });

  it('parses successful shipment response with tracking PIN and label artifact link', async () => {
    const { parseCanadaPostShipmentResponse } = await import('../src/lib/canadapost.js');
    const sampleShipmentXml = `<?xml version="1.0" encoding="UTF-8"?>
<non-contract-shipment-info xmlns="http://www.canadapost.ca/ws/ncshipment-v4">
  <shipment-id>123456789012345678</shipment-id>
  <tracking-pin>1234567890123456</tracking-pin>
  <links>
    <link rel="self" href="https://soa-gw.canadapost.ca/rs/0007123456/ncshipment/123456789012345678" media-type="application/vnd.cpc.ncshipment-v4+xml"/>
    <link rel="label" href="https://soa-gw.canadapost.ca/rs/artifact/6e933e69452/10000/0" media-type="application/pdf"/>
    <link rel="receipt" href="https://soa-gw.canadapost.ca/rs/0007123456/ncshipment/123456789012345678/receipt" media-type="application/vnd.cpc.ncshipment-v4+xml"/>
  </links>
</non-contract-shipment-info>`;

    const parsed = parseCanadaPostShipmentResponse(sampleShipmentXml);
    expect(parsed.ok).toBe(true);
    expect(parsed.shipmentId).toBe('123456789012345678');
    expect(parsed.trackingPin).toBe('1234567890123456');
    expect(parsed.labelUrl).toBe('https://soa-gw.canadapost.ca/rs/artifact/6e933e69452/10000/0');
    expect(parsed.receiptUrl).toBe('https://soa-gw.canadapost.ca/rs/0007123456/ncshipment/123456789012345678/receipt');
  });

  it('validates 13-character Zonos Declaration ID format and embeds it in customs XML', async () => {
    const { validateDeclarationId, formatDeclarationId, buildNonContractShipmentXml } = await import('../src/lib/canadapost.js');

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

    const xml = buildNonContractShipmentXml({
      serviceCode: 'USA.TP',
      destination: { countryCode: 'US', postalCode: '90210' },
      parcel: { weightKg: 0.5 },
      declarationId: '0rd4dpkrvc1y9'
    });

    expect(xml).toContain('<declaration-id>0rd4dpkrvc1y9</declaration-id>');
    expect(xml).not.toContain('<declaration-id>0RD4DPKRVC1Y9</declaration-id>');
  });

  it('keeps a Zonos Declaration ID lowercase even when it arrives upper-cased', async () => {
    const { buildNonContractShipmentXml } = await import('../src/lib/canadapost.js');
    const xml = buildNonContractShipmentXml({
      serviceCode: 'USA.TP',
      destination: { countryCode: 'US', postalCode: '90210' },
      parcel: { weightKg: 0.5 },
      customs: { declarationId: '0RCVXJ2TKBNWR', declaredValue: 25, quantity: 1 }
    });
    expect(xml).toContain('<declaration-id>0rcvxj2tkbnwr</declaration-id>');
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

  it('correctly formats multi-line addresses and normalized states in shipment XML', async () => {
    const { buildNonContractShipmentXml } = await import('../src/lib/canadapost.js');
    const xml = buildNonContractShipmentXml({
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

    expect(xml).toContain('<address-line-1>123 Bookish Way</address-line-1>');
    expect(xml).toContain('<address-line-2>Suite 400</address-line-2>');
    expect(xml).toContain('<prov-state>ON</prov-state>');
    expect(xml).toContain('<name>Daniela Dawson</name>');
    expect(xml).toContain('<address-line-1>PO Box 897</address-line-1>');
    expect(xml).toContain('<address-line-2>29e laundry hill road</address-line-2>');
    expect(xml).toContain('<city>Bisbee</city>');
    expect(xml).toContain('<prov-state>AZ</prov-state>');
    expect(xml).toContain('<postal-zip-code>85603</postal-zip-code>');
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




describe('Canada Post Account & Environment Validation', () => {
  it('resolves the live and sandbox gateways to distinct hosts', async () => {
    const { resolveCanadaPostEnvironment } = await import('../src/lib/canadapost.js');

    const live = resolveCanadaPostEnvironment({ isTest: false });
    expect(live.mode).toBe('live');
    expect(live.hostname).toBe('soa-gw.canadapost.ca');
    expect(live.baseUrl).toBe('https://soa-gw.canadapost.ca');
    expect(live.label).toBe('Live Production Mode');

    const sandbox = resolveCanadaPostEnvironment({ isTest: true });
    expect(sandbox.mode).toBe('sandbox');
    expect(sandbox.hostname).toBe('ct.soa-gw.canadapost.ca');
    expect(sandbox.baseUrl).toBe('https://ct.soa-gw.canadapost.ca');
    expect(sandbox.label).toBe('Sandbox Test Mode');
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
    expect(sandbox.warnings.join(' ')).toMatch(/not real/i);
  });
});

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
      targetEndpoint: 'https://soa-gw.canadapost.ca/rs/0042998877/ncshipment',
      xmlPayload: '<non-contract-shipment/>',
      ...realCreds,
      isTest: false
    })).rejects.toThrow(/no label was purchased/i);
  });

  it('still simulates a shipment in sandbox mode and marks it as simulated', async () => {
    const { executeCanadaPostProxy } = await import('../src/lib/canadapost.js');
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await executeCanadaPostProxy({
      targetEndpoint: 'https://ct.soa-gw.canadapost.ca/rs/0042998877/ncshipment',
      xmlPayload: '<non-contract-shipment/>',
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
      targetEndpoint: 'https://soa-gw.canadapost.ca/rs/0042998877/ncshipment',
      xmlPayload: '<non-contract-shipment/>',
      isTest: false
    })).rejects.toThrow(/no label was purchased/i);
  });

  it('routes a purchase through the merchant customer number endpoint', async () => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');
    const successXml = `<?xml version="1.0" encoding="UTF-8"?>
      <non-contract-shipment-info>
        <shipment-id>406951321983787352</shipment-id>
        <tracking-pin>70123456789012345</tracking-pin>
        <links>
          <link rel="label" href="https://soa-gw.canadapost.ca/rs/artifact/abc/10000/0"/>
        </links>
      </non-contract-shipment-info>`;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, xml: successXml }),
      text: async () => successXml,
      headers: { get: () => 'application/xml' }
    });

    const result = await buyCanadaPostLabel({
      serviceCode: 'USA.TP',
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
    expect(proxyBody.targetEndpoint).toBe('https://soa-gw.canadapost.ca/rs/0042998877/ncshipment');
    expect(proxyBody.xmlPayload).toContain('<declaration-id>0rd4dpkrvc1y9</declaration-id>');
  });
});

describe('Purchased labels stay reprintable offline', () => {
  const realCreds = {
    apiKey: 'merchant_key_abc',
    apiSecret: 'merchant_secret_xyz',
    customerNumber: '0042998877'
  };

  const shipmentXml = pin => `<?xml version="1.0" encoding="UTF-8"?>
    <non-contract-shipment-info>
      <shipment-id>4069513219837873${pin.slice(-2)}</shipment-id>
      <tracking-pin>${pin}</tracking-pin>
      <links><link rel="label" href="https://soa-gw.canadapost.ca/rs/artifact/abc/10000/0"/></links>
    </non-contract-shipment-info>`;

  const buy = async (pin, orderNum) => {
    const { buyCanadaPostLabel } = await import('../src/lib/canadapost.js');
    const xml = shipmentXml(pin);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, xml }),
      text: async () => xml,
      headers: { get: () => 'application/xml' }
    });
    return buyCanadaPostLabel({
      serviceCode: 'DOM.EP',
      orderNum,
      destination: { countryCode: 'CA', postalCode: 'V6B2W9', address1: '1 Main St', city: 'Vancouver' },
      parcel: { weightKg: 0.5 },
      ...realCreds,
      isTest: false
    });
  };

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
    localStorage.clear();
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

  it('does not offer a simulated shipment for reprint', async () => {
    const { executeCanadaPostProxy, setLastPurchasedShipmentContext, listArchivedShipments } =
      await import('../src/lib/canadapost.js');

    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));
    const sim = await executeCanadaPostProxy({
      targetEndpoint: 'https://ct.soa-gw.canadapost.ca/rs/0042998877/ncshipment',
      xmlPayload: '<non-contract-shipment/>',
      ...realCreds,
      isTest: true
    });
    setLastPurchasedShipmentContext({ ...sim, orderNum: 'SIM-1' });

    // Nothing was purchased, so there is no label worth reprinting.
    expect(listArchivedShipments()).toEqual([]);
  });
});

describe('Canada Post Tracking PIN Verification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.fetch;
  });

  it('parses a tracking summary into a shipment status record', async () => {
    const { parseCanadaPostTrackingSummary } = await import('../src/lib/canadapost.js');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <tracking-summary>
        <pin-summary>
          <pin>70123456789012345</pin>
          <origin-postal-id>M4B</origin-postal-id>
          <destination-postal-id>V6B</destination-postal-id>
          <service-name>Expedited Parcel</service-name>
          <event-description>Delivered</event-description>
          <event-date-time>20260824:101500</event-date-time>
          <event-location>VANCOUVER, BC</event-location>
          <expected-delivery-date>2026-08-25</expected-delivery-date>
          <actual-delivery-date>2026-08-24</actual-delivery-date>
        </pin-summary>
      </tracking-summary>`;

    const parsed = parseCanadaPostTrackingSummary(xml);
    expect(parsed.found).toBe(true);
    expect(parsed.pin).toBe('70123456789012345');
    expect(parsed.status).toBe('Delivered');
    expect(parsed.serviceName).toBe('Expedited Parcel');
    expect(parsed.expectedDeliveryDate).toBe('2026-08-25');
  });

  it('surfaces a Canada Post error document rather than reporting a phantom shipment', async () => {
    const { parseCanadaPostTrackingSummary } = await import('../src/lib/canadapost.js');
    const errXml = `<?xml version="1.0" encoding="UTF-8"?>
      <messages>
        <message>
          <code>004</code>
          <description>No Pin History</description>
        </message>
      </messages>`;

    expect(() => parseCanadaPostTrackingSummary(errXml)).toThrow(/No Pin History/);
    expect(() => parseCanadaPostTrackingSummary('')).toThrow(/Empty response/);
  });

  it('verifies a tracking PIN against the correct environment endpoint', async () => {
    const { verifyCanadaPostTrackingPin } = await import('../src/lib/canadapost.js');
    const xml = '<tracking-summary><pin-summary><pin>70123456789012345</pin><event-description>In Transit</event-description></pin-summary></tracking-summary>';

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, xml }),
      text: async () => xml
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
