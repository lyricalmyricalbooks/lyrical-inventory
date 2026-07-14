import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Shipping Analysis Hub Functions', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  let parseCarrierInfo;
  let getWeightInLbs;

  beforeEach(() => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');

    // Extract helper functions
    const carrierMatch = mainContent.match(/function parseCarrierInfo\(desc\) \{([\s\S]+?)\n\}/);
    const weightMatch = mainContent.match(/function getWeightInLbs\(qty, book\) \{([\s\S]+?)\n\}/);

    expect(carrierMatch).not.toBeNull();
    expect(weightMatch).not.toBeNull();

    parseCarrierInfo = new Function('desc', carrierMatch[0] + '\nreturn parseCarrierInfo(desc);');
    getWeightInLbs = new Function('qty', 'book', weightMatch[0] + '\nreturn getWeightInLbs(qty, book);');
  });

  describe('parseCarrierInfo', () => {
    it('correctly extracts provider and service level from description patterns', () => {
      expect(parseCarrierInfo('Shipping Label: USPS Priority Mail (12345)')).toEqual({
        provider: 'USPS',
        service: 'Priority Mail'
      });
      expect(parseCarrierInfo('Shipping Label: Canada Post Expedited Parcel (manual)')).toEqual({
        provider: 'Canada',
        service: 'Post Expedited Parcel'
      });
      expect(parseCarrierInfo('Shippo shipping label #12345')).toEqual({
        provider: 'Shippo',
        service: 'Postage'
      });
      expect(parseCarrierInfo('Random non-shipping expense')).toEqual({
        provider: 'Unknown',
        service: 'Unknown'
      });
    });
  });

  describe('getWeightInLbs', () => {
    it('normalizes weights from various units to pounds', () => {
      expect(getWeightInLbs(1, { shipWeight: 1, shipWeightUnit: 'lb' })).toBe(1);
      expect(getWeightInLbs(1, { shipWeight: 16, shipWeightUnit: 'oz' })).toBe(1);
      expect(getWeightInLbs(1, { shipWeight: 1, shipWeightUnit: 'kg' })).toBeCloseTo(2.20462, 4);
      expect(getWeightInLbs(1, { shipWeight: 453.592, shipWeightUnit: 'g' })).toBeCloseTo(1.0, 4);
      expect(getWeightInLbs(2, null)).toBe(2.4);
    });
  });
});
