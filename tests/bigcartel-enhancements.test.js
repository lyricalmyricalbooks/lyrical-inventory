import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Big Cartel Orders Enhancements (#2, #3, #4, #6)', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  let matchBigCartelOrderToCatalog;
  let formatBigCartelOrderAddress;
  let extractBigCartelOrderItems;

  beforeEach(() => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');

    const matchFunc = mainContent.match(/function matchBigCartelOrderToCatalog\([^)]*\)\s*\{([\s\S]+?)\n\}/);
    const formatFunc = mainContent.match(/function formatBigCartelOrderAddress\([^)]*\)\s*\{([\s\S]+?)\n\}/);
    const extractItemsFunc = mainContent.match(/function extractBigCartelOrderItems\([^)]*\)\s*\{([\s\S]+?)\n\}/);

    expect(matchFunc).not.toBeNull();
    expect(formatFunc).not.toBeNull();
    expect(extractItemsFunc).not.toBeNull();

    matchBigCartelOrderToCatalog = new Function('order', 'included', 'BOOKS', 'function escapeHTML(s){return String(s||"");}\n' + extractItemsFunc[0] + '\n' + matchFunc[0] + '\nreturn matchBigCartelOrderToCatalog(order, included, BOOKS);');
    formatBigCartelOrderAddress = new Function('order', formatFunc[0] + '\nreturn formatBigCartelOrderAddress(order);');
    extractBigCartelOrderItems = new Function('order', 'included', 'customBooks', 'function escapeHTML(s){return String(s||"");}\n' + extractItemsFunc[0] + '\nreturn extractBigCartelOrderItems(order, included, customBooks);');
  });

  describe('extractBigCartelOrderItems', () => {
    const mockBooks = {
      altrove: { id: 'altrove', title: 'Altrove', listPrice: '32.50' }
    };

    function escapeHTML(str) { return str; }

    it('deduces ordered catalog items from order net total when line items array is stripped', () => {
      const order = {
        id: 'JMIQ-538069',
        attributes: {
          total: '57.50',
          shipping_total: '25.00',
          tax_total: '0.00'
        }
      };

      const result = extractBigCartelOrderItems(order, [], mockBooks, escapeHTML);
      expect(result).toContain('Altrove x1');
    });

    it('deduces multiple quantities based on net merchandise ratio', () => {
      const order = {
        id: 'ILTK-951862',
        attributes: {
          total: '94.00',
          shipping_total: '29.00',
          tax_total: '0.00'
        }
      };

      const result = extractBigCartelOrderItems(order, [], mockBooks, escapeHTML);
      expect(result).toContain('Altrove x2');
    });
  });

  describe('matchBigCartelOrderToCatalog', () => {
    const mockBooks = {
      book1: { id: 'book1', title: 'Altrove' },
      book2: { id: 'book2', title: 'The Hound' }
    };

    it('identifies exact matches between line item product names and catalog books', () => {
      const order = {
        id: '101',
        attributes: {
          line_items: [
            { product_name: 'Altrove', quantity: 1 }
          ]
        }
      };

      const result = matchBigCartelOrderToCatalog(order, [], mockBooks);
      expect(result.matched).toBe(true);
      expect(result.matchedBooks).toContain('Altrove');
    });

    it('identifies matches via JSON:API included item relationships', () => {
      const order = {
        id: '102',
        relationships: {
          items: {
            data: [{ type: 'items', id: 'item1' }]
          }
        }
      };
      const included = [
        { type: 'items', id: 'item1', attributes: { product_name: 'The Hound', quantity: 2 } }
      ];

      const result = matchBigCartelOrderToCatalog(order, included, mockBooks);
      expect(result.matched).toBe(true);
      expect(result.matchedBooks).toContain('The Hound');
    });

    it('returns unmatched status when item is not in catalog', () => {
      const order = {
        id: '103',
        attributes: {
          line_items: [
            { product_name: 'Unknown Merch T-Shirt', quantity: 1 }
          ]
        }
      };

      const result = matchBigCartelOrderToCatalog(order, [], mockBooks);
      expect(result.matched).toBe(false);
      expect(result.matchedBooks).toHaveLength(0);
    });
  });

  describe('formatBigCartelOrderAddress', () => {
    it('formats multi-line shipping address for clipboard copying', () => {
      const order = {
        id: '201',
        attributes: {
          shipping_name: 'Jane Doe',
          shipping_address_1: '123 Main Street',
          shipping_address_2: 'Apt 4B',
          shipping_city: 'Toronto',
          shipping_state: 'ON',
          shipping_zip: 'M5V 2J4',
          shipping_country: 'Canada',
          buyer_phone: '416-555-0199',
          buyer_email: 'jane@example.com'
        }
      };

      const addressText = formatBigCartelOrderAddress(order);
      expect(addressText).toContain('Jane Doe');
      expect(addressText).toContain('123 Main Street');
      expect(addressText).toContain('Apt 4B');
      expect(addressText).toContain('Toronto, ON M5V 2J4');
      expect(addressText).toContain('Canada');
      expect(addressText).toContain('Phone: 416-555-0199');
      expect(addressText).toContain('Email: jane@example.com');
    });
  });

  describe('extractBigCartelAddress', () => {
    let extractBigCartelAddress;

    beforeEach(() => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf8');
      const countryCodesMatch = mainContent.match(/const SHIPPO_COUNTRY_CODES = \{[\s\S]+?\};/);
      const extractFuncMatch = mainContent.match(/function extractBigCartelAddress\([^)]*\)\s*\{([\s\S]+?)\n\}/);
      const normCountryMatch = mainContent.match(/function normalizeCountryCode\([^)]*\)\s*\{([\s\S]+?)\n\}/);

      expect(countryCodesMatch).not.toBeNull();
      expect(extractFuncMatch).not.toBeNull();
      expect(normCountryMatch).not.toBeNull();

      extractBigCartelAddress = new Function('attr', 'orderId', countryCodesMatch[0] + '\n' + normCountryMatch[0] + '\n' + extractFuncMatch[0] + '\nreturn extractBigCartelAddress(attr, orderId);');
    });

    it('extracts recipient and address fields correctly from flat shipping attributes', () => {
      const attr = {
        shipping_name: 'Alice Smith',
        shipping_company: 'Acme Books',
        shipping_phone: '555-1234',
        shipping_address_1: '789 Oak Ave',
        shipping_address_2: 'Suite 100',
        shipping_city: 'Vancouver',
        shipping_state: 'BC',
        shipping_zip: 'V6B 1A1',
        shipping_country_code: 'CA'
      };

      const result = extractBigCartelAddress(attr, 'ORD-001');
      expect(result.orderNumber).toBe('ORD-001');
      expect(result.name).toBe('Alice Smith');
      expect(result.company).toBe('Acme Books');
      expect(result.phone).toBe('555-1234');
      expect(result.street1).toBe('789 Oak Ave');
      expect(result.street2).toBe('Suite 100');
      expect(result.city).toBe('Vancouver');
      expect(result.state).toBe('BC');
      expect(result.zip).toBe('V6B 1A1');
      expect(result.country).toBe('CA');
    });

    it('falls back to buyer name, customer email, and nested country objects', () => {
      const attr = {
        buyer_first_name: 'Bob',
        buyer_last_name: 'Jones',
        buyer_phone: '555-9876',
        address_1: '456 Pine St',
        city: 'Seattle',
        state: 'WA',
        zip: '98101',
        shipping_country: { code: 'US' }
      };

      const result = extractBigCartelAddress(attr, 'ORD-002');
      expect(result.name).toBe('Bob Jones');
      expect(result.phone).toBe('555-9876');
      expect(result.street1).toBe('456 Pine St');
      expect(result.city).toBe('Seattle');
      expect(result.state).toBe('WA');
      expect(result.zip).toBe('98101');
      expect(result.country).toBe('US');
    });
  });
});
