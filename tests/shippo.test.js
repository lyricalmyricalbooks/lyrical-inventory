import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Shippo Customs & Country Helpers', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  let normalizeCountryCode;
  let isInternationalShipment;
  let buildShippoCustomsDeclaration;
  let readShippoCustomsValue;

  // We extract the functions statically so we don't have to load main.js's DOM dependencies
  beforeEach(() => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');

    // Extract SHIPPO_COUNTRY_CODES object
    const shippoCodesMatch = mainContent.match(/const SHIPPO_COUNTRY_CODES = \{[\s\S]+?\};/);
    expect(shippoCodesMatch).not.toBeNull();

    // Extract helper functions
    const normMatch = mainContent.match(/function normalizeCountryCode\(code\) \{([\s\S]+?)\n\}/);
    const interMatch = mainContent.match(/function isInternationalShipment\(fromCountry, toCountry\) \{([\s\S]+?)\n\}/);
    const readMatch = mainContent.match(/function readShippoCustomsValue\(id, fallback\) \{([\s\S]+?)\n\}/);
    const declMatch = mainContent.match(/function buildShippoCustomsDeclaration\(\{ sfName, sfCountryCode, spWeight, spWeightUnit \}\) \{([\s\S]+?)\n\}/);

    expect(normMatch).not.toBeNull();
    expect(interMatch).not.toBeNull();
    expect(readMatch).not.toBeNull();
    expect(declMatch).not.toBeNull();

    // Reconstruct them with new Function
    normalizeCountryCode = new Function('code', 
      shippoCodesMatch[0] + '\n' + normMatch[0] + '\nreturn normalizeCountryCode(code);'
    );
    isInternationalShipment = new Function('fromCountry', 'toCountry', 
      shippoCodesMatch[0] + '\n' + normMatch[0] + '\n' + interMatch[0] + '\nreturn isInternationalShipment(fromCountry, toCountry);'
    );
    
    // We will provide a custom $ function to the environment inside the Function call
    readShippoCustomsValue = new Function('$', 'id', 'fallback', 
      readMatch[0] + '\nreturn readShippoCustomsValue(id, fallback);'
    );

    buildShippoCustomsDeclaration = new Function('$', 'normalizeCountryCode', 'readShippoCustomsValue', 'params',
      `const { sfName, sfCountryCode, spWeight, spWeightUnit } = params;\n` +
      declMatch[0] + '\n' +
      `return buildShippoCustomsDeclaration({ sfName, sfCountryCode, spWeight, spWeightUnit });`
    );
  });

  describe('normalizeCountryCode', () => {
    it('normalizes common country names and codes', () => {
      expect(normalizeCountryCode('Canada')).toBe('CA');
      expect(normalizeCountryCode('ca')).toBe('CA');
      expect(normalizeCountryCode('USA')).toBe('US');
      expect(normalizeCountryCode('united states')).toBe('US');
      expect(normalizeCountryCode('united kingdom')).toBe('GB');
      expect(normalizeCountryCode('GB')).toBe('GB');
      expect(normalizeCountryCode('MX')).toBe('MX');
    });

    it('returns two letter codes unmodified if they match regex', () => {
      expect(normalizeCountryCode('JP')).toBe('JP');
      expect(normalizeCountryCode('jp')).toBe('JP');
      expect(normalizeCountryCode('FR')).toBe('FR');
    });

    it('returns US as fallback for null or empty values', () => {
      expect(normalizeCountryCode(null)).toBe('US');
      expect(normalizeCountryCode('')).toBe('US');
      expect(normalizeCountryCode(undefined)).toBe('US');
    });
  });

  describe('isInternationalShipment', () => {
    it('correctly identifies international shipments', () => {
      expect(isInternationalShipment('Canada', 'United States')).toBe(true);
      expect(isInternationalShipment('CA', 'US')).toBe(true);
      expect(isInternationalShipment('US', 'GB')).toBe(true);
    });

    it('correctly identifies domestic shipments', () => {
      expect(isInternationalShipment('Canada', 'CA')).toBe(false);
      expect(isInternationalShipment('Canada', 'canada')).toBe(false);
      expect(isInternationalShipment('US', 'USA')).toBe(false);
      expect(isInternationalShipment('GB', 'United Kingdom')).toBe(false);
    });
  });

  describe('buildShippoCustomsDeclaration', () => {
    it('builds a valid customs declaration structure', () => {
      const mockElements = {
        'sp-qty': '2',
        'sp-customs-description': 'Novels',
        'sp-customs-value': '30.00',
        'sp-customs-hs': '490199'
      };
      
      const mock$ = (id) => ({ value: mockElements[id] });

      const params = {
        sfName: 'Alice Sender',
        sfCountryCode: 'CA',
        spWeight: 1.5,
        spWeightUnit: 'lb'
      };

      const customsValHelper = (id, fallback) => readShippoCustomsValue(mock$, id, fallback);

      const decl = buildShippoCustomsDeclaration(mock$, normalizeCountryCode, customsValHelper, params);

      expect(decl).toEqual({
        certify: true,
        certify_signer: 'Alice Sender',
        contents_type: 'MERCHANDISE',
        contents_explanation: 'Printed books',
        non_delivery_option: 'RETURN',
        incoterm: 'DDU',
        eel_pfc: 'NOEEI_30_37_a',
        items: [{
          description: 'Novels',
          quantity: 2,
          net_weight: '1.50',
          mass_unit: 'lb',
          value_amount: '30.00',
          value_currency: 'CAD',
          origin_country: 'CA',
          tariff_number: '490199'
        }]
      });
    });

    it('uses fallback values when element values are missing or invalid', () => {
      const mockElements = {
        'sp-qty': 'invalid',
        'sp-customs-description': '',
        'sp-customs-value': 'invalid',
        'sp-customs-hs': ''
      };
      
      const mock$ = (id) => ({ value: mockElements[id] });

      const params = {
        sfName: 'Bob Sender',
        sfCountryCode: 'US',
        spWeight: 0.8,
        spWeightUnit: 'oz'
      };

      const customsValHelper = (id, fallback) => readShippoCustomsValue(mock$, id, fallback);

      const decl = buildShippoCustomsDeclaration(mock$, normalizeCountryCode, customsValHelper, params);

      expect(decl.certify_signer).toBe('Bob Sender');
      expect(decl.items[0]).toEqual({
        description: 'Printed books',
        quantity: 1,
        net_weight: '0.80',
        mass_unit: 'oz',
        value_amount: '25.00',
        value_currency: 'CAD',
        origin_country: 'US',
        tariff_number: '490199'
      });
    });
  });
});
