import { describe, it, expect } from 'vitest';
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
