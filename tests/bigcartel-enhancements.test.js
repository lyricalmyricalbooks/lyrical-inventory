import { describe, it, expect, beforeEach } from 'vitest';
import { appSource } from './helpers/extract-decl.js';
import { resolveCountryCode } from '../src/lib/countries.js';
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
    const mainContent = appSource;

    const matchFunc = mainContent.match(/function matchBigCartelOrderToCatalog\([^)]*\)\s*\{([\s\S]+?)\n\}/);
    const formatFunc = mainContent.match(/function formatBigCartelOrderAddress\([^)]*\)\s*\{([\s\S]+?)\n\}/);
    const extractItemsFunc = mainContent.match(/function extractBigCartelOrderItems\([^)]*\)\s*\{([\s\S]+?)\n\}/);

    expect(matchFunc).not.toBeNull();
    expect(formatFunc).not.toBeNull();
    expect(extractItemsFunc).not.toBeNull();

    matchBigCartelOrderToCatalog = new Function('order', 'included', 'BOOKS', 'function escapeHTML(s){return String(s||"");}\n' + extractItemsFunc[0] + '\n' + matchFunc[0] + '\nreturn matchBigCartelOrderToCatalog(order, included, BOOKS);');
    const extractAddrFunc = mainContent.match(/function extractBigCartelAddress\([^)]*\)\s*\{([\s\S]+?)\n\}/);

    formatBigCartelOrderAddress = new Function('resolveCountryCode', 'order', extractAddrFunc[0] + '\n' + formatFunc[0] + '\nreturn formatBigCartelOrderAddress(order);').bind(null, resolveCountryCode);
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
      expect(addressText).toContain('CA');
      expect(addressText).toContain('Phone: 416-555-0199');
      expect(addressText).toContain('Email: jane@example.com');
    });
  });

  describe('extractBigCartelAddress', () => {
    let extractBigCartelAddress;

    beforeEach(() => {
      const mainContent = appSource;
      const extractFuncMatch = mainContent.match(/function extractBigCartelAddress\([^)]*\)\s*\{([\s\S]+?)\n\}/);

      expect(extractFuncMatch).not.toBeNull();

      extractBigCartelAddress = new Function('resolveCountryCode', 'attr', 'orderId', extractFuncMatch[0] + '\nreturn extractBigCartelAddress(attr, orderId);').bind(null, resolveCountryCode);
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

    // The order that started this: a Serbian customer arrived with the country
    // only in shipping_country_name, behind a numeric shipping_country_id that
    // used to win the || chain and resolve to nothing — so the whole address
    // fell through to a blanket 'US' default and the sale was counted as
    // American everywhere in the app.
    it('reads the country name past a numeric Big Cartel country id', () => {
      const attr = {
        shipping_name: 'Mila Vukojev',
        shipping_address_1: 'Jugoslovenske Armije 204',
        shipping_city: 'Bačka Palanka',
        shipping_zip: '21400',
        shipping_country_id: 188,
        shipping_country_name: 'Serbia',
      };

      const result = extractBigCartelAddress(attr, 'SUVG-483215');
      expect(result.country).toBe('RS');
      expect(result.country).not.toBe('US');
    });

    it('leaves the country blank, and says what it saw, when it cannot place it', () => {
      const result = extractBigCartelAddress({
        shipping_name: 'Nobody',
        shipping_city: 'Nowhere',
        shipping_country_name: 'Wakanda',
      }, 'ORD-003');
      expect(result.country).toBe('');
      expect(result.countryRaw).toBe('Wakanda');
    });
  });

  describe('extractBigCartelAddress JSON:API relationship resolution', () => {
    let extractBigCartelAddress;

    beforeEach(() => {
      const mainContent = appSource;
      const extractFuncMatch = mainContent.match(/function extractBigCartelAddress\([^)]*\)\s*\{([\s\S]+?)\n\}/);

      extractBigCartelAddress = new Function('resolveCountryCode', 'order', 'orderId', 'included',
        extractFuncMatch[0] +
        '\nreturn extractBigCartelAddress(order, orderId, included);').bind(null, resolveCountryCode);
    });

    const buildOrder = () => ({
      id: 'GOEQ-951023',
      attributes: { shipping_city: 'Barcelona', shipping_country_code: 'ES' },
      relationships: {
        customer: { data: { type: 'customers', id: '77' } },
        shipping_address: { data: { type: 'shipping_addresses', id: '42' } },
        items: { data: [{ type: 'order_items', id: '9' }] }
      }
    });

    it('pulls the phone from the included shipping_address resource', () => {
      const included = [
        { type: 'order_items', id: '9', attributes: { name: 'Altrove' } },
        { type: 'customers', id: '77', attributes: { first_name: 'Irma', last_name: 'Oliveras Binoux' } },
        { type: 'shipping_addresses', id: '42', attributes: { phone: '+34 612 345 678', address_1: 'Gran via 732', city: 'Barcelona', zip: '08013' } }
      ];

      const result = extractBigCartelAddress(buildOrder(), 'GOEQ-951023', included);
      expect(result.phone).toBe('+34 612 345 678');
      expect(result.name).toBe('Irma Oliveras Binoux');
      expect(result.street1).toBe('Gran via 732');
    });

    it('does not match an included resource whose id collides across types', () => {
      const included = [
        { type: 'order_items', id: '42', attributes: { phone: '000-BAD-LINE' } }
      ];

      const result = extractBigCartelAddress(buildOrder(), 'GOEQ-951023', included);
      expect(result.phone).toBe('');
    });

    it('accepts alternate phone key spellings on the customer resource', () => {
      const included = [
        { type: 'customers', id: '77', attributes: { name: 'Irma', phone_number: '604-555-0123' } }
      ];

      const result = extractBigCartelAddress(buildOrder(), 'GOEQ-951023', included);
      expect(result.phone).toBe('604-555-0123');
    });

    it('falls back to an included contact resource that points back at the order', () => {
      const order = { id: 'GOEQ-951023', attributes: { shipping_city: 'Barcelona' }, relationships: {} };
      const included = [
        { type: 'customers', id: '77', attributes: { telephone: '555-0000' }, relationships: { order: { data: { id: 'OTHER-1' } } } },
        { type: 'customers', id: '88', attributes: { telephone: '555-7788' }, relationships: { order: { data: { id: 'GOEQ-951023' } } } }
      ];

      const result = extractBigCartelAddress(order, 'GOEQ-951023', included);
      expect(result.phone).toBe('555-7788');
    });

    it('keeps flat shipping attributes ahead of included resources', () => {
      const order = buildOrder();
      order.attributes.shipping_phone = '+34 999 111 222';
      const included = [
        { type: 'shipping_addresses', id: '42', attributes: { phone: '+34 612 345 678' } }
      ];

      const result = extractBigCartelAddress(order, 'GOEQ-951023', included);
      expect(result.phone).toBe('+34 999 111 222');
    });
  });

  describe('destination prefill wiring', () => {
    const mainContent = appSource;

    it('passes the whole order (not just attributes) so relationships survive', () => {
      expect(mainContent).not.toContain('extractBigCartelAddress(o.attributes || {}, o.id)');
      expect(mainContent).not.toContain('extractBigCartelAddress(order.attributes || {}, orderId)');
      expect(mainContent).toContain('extractBigCartelAddress(o, o.id, bcIncluded)');
      expect(mainContent).toContain('extractBigCartelAddress(order, orderId, getBigCartelIncluded())');
    });

    it('hydrates a blank recipient phone straight from the Big Cartel API', () => {
      expect(mainContent).toContain('async function hydrateShippingDestinationPhone(');
      expect(mainContent).toContain('function rememberBigCartelDestinationPhone(');
      expect(mainContent).toMatch(/if \(!\$\('st-phone'\)\.value && select\.dataset\.orderNumber\)/);
    });
  });
});
