import { describe, it, expect } from 'vitest';
import {
  buildRateScenarioJson,
  parseCanadaPostPriceQuotes
} from '../src/lib/canadapost.js';

describe('Canada Post Retail (Counter) Rating', () => {
  it('builds a counter rate scenario with no customer number or contract id', () => {
    const payloadStr = buildRateScenarioJson({
      originPostalCode: 'M6G3H1',
      destCountry: 'CA',
      destPostalOrZip: 'M6H2W4',
      weightKg: 0.367,
      lengthCm: 23,
      widthCm: 19.5,
      heightCm: 2,
      quoteType: 'counter'
    });

    const parsed = JSON.parse(payloadStr);
    expect(parsed.quoteType).toBe('counter');
    expect(parsed.customerNumber).toBeUndefined();
    expect(parsed.contractId).toBeUndefined();
    expect(parsed.originPostalCode).toBe('M6G3H1');
    expect(parsed.destination.domestic.postalCode).toBe('M6H2W4');
    expect(parsed.parcelCharacteristics.weight).toBe(0.367);
    expect(parsed.parcelCharacteristics.dimensions.length).toBe(23);
  });

  it('enforces a 0.1 kg minimum parcel weight floor for sub-100g inputs', () => {
    const payloadStr = buildRateScenarioJson({
      originPostalCode: 'M6G3H1',
      destCountry: 'CA',
      destPostalOrZip: 'M6H2W4',
      weightKg: 0.005, // 5 grams
      quoteType: 'counter'
    });

    const parsed = JSON.parse(payloadStr);
    expect(parsed.parcelCharacteristics.weight).toBe(0.1);
  });

  it('omits customerNumber on counter quotes even if customerNumber is passed into buildRateScenarioJson', () => {
    const payloadStr = buildRateScenarioJson({
      originPostalCode: 'M6G3H1',
      destCountry: 'US',
      destPostalOrZip: '10009',
      weightKg: 0.5,
      customerNumber: '0001298882',
      quoteType: 'counter'
    });

    const parsed = JSON.parse(payloadStr);
    expect(parsed.quoteType).toBe('counter');
    expect(parsed.customerNumber).toBeUndefined();
    expect(parsed.destination.unitedStates.zipCode).toBe('10009');
  });
});

describe('Canada Post Price Quotes Parser (Multi-Shape)', () => {
  it('parses Developer Portal JSON format with priceQuotes.priceQuote array', () => {
    const json = JSON.stringify({
      priceQuotes: {
        priceQuote: [
          {
            serviceCode: 'DOM.RP',
            serviceName: 'Regular Parcel',
            priceDetails: {
              base: '12.50',
              due: '14.13',
              taxes: { gst: '0.63', pst: '1.00', hst: '0.00' }
            },
            serviceStandard: {
              expectedTransitTime: '2',
              expectedDeliveryDate: '2026-09-04'
            }
          }
        ]
      }
    });

    const quotes = parseCanadaPostPriceQuotes(json);
    expect(quotes.length).toBe(1);
    expect(quotes[0].serviceCode).toBe('DOM.RP');
    expect(quotes[0].serviceName).toBe('Regular Parcel');
    expect(quotes[0].totalPrice).toBe(14.13);
    expect(quotes[0].taxes).toBe(1.63);
    expect(quotes[0].transitDays).toBe(2);
  });

  it('parses Developer Portal direct array structure', () => {
    const json = JSON.stringify([
      {
        serviceCode: 'DOM.EP',
        serviceName: 'Expedited Parcel',
        priceDetails: {
          base: '15.00',
          due: '16.95',
          taxes: { gst: '0.75', pst: '1.20', hst: '0.00' }
        },
        serviceStandard: {
          expectedTransitTime: '1'
        }
      }
    ]);

    const quotes = parseCanadaPostPriceQuotes(json);
    expect(quotes.length).toBe(1);
    expect(quotes[0].serviceCode).toBe('DOM.EP');
    expect(quotes[0].totalPrice).toBe(16.95);
  });

  it('parses rates when root key is prices or rates', () => {
    const json = JSON.stringify({
      prices: [
        {
          serviceCode: 'USA.TP',
          serviceName: 'Tracked Packet - USA',
          basePrice: 18.25,
          totalPrice: 20.62,
          taxes: 2.37,
          transitDays: 5
        }
      ]
    });

    const quotes = parseCanadaPostPriceQuotes(json);
    expect(quotes.length).toBe(1);
    expect(quotes[0].serviceCode).toBe('USA.TP');
    expect(quotes[0].totalPrice).toBe(20.62);
  });

  it('throws friendly error when Canada Post returns error object', () => {
    const json = JSON.stringify({
      code: 'ERR_INVALID_DEST',
      description: 'Postal code not recognized'
    });

    expect(() => parseCanadaPostPriceQuotes(json)).toThrowError(/ERR_INVALID_DEST/);
  });
});
