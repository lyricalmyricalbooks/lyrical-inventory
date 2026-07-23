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

  beforeEach(() => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');

    const matchFunc = mainContent.match(/function matchBigCartelOrderToCatalog\([^)]*\)\s*\{([\s\S]+?)\n\}/);
    const formatFunc = mainContent.match(/function formatBigCartelOrderAddress\([^)]*\)\s*\{([\s\S]+?)\n\}/);

    expect(matchFunc).not.toBeNull();
    expect(formatFunc).not.toBeNull();

    matchBigCartelOrderToCatalog = new Function('order', 'included', 'BOOKS', matchFunc[0] + '\nreturn matchBigCartelOrderToCatalog(order, included);');
    formatBigCartelOrderAddress = new Function('order', formatFunc[0] + '\nreturn formatBigCartelOrderAddress(order);');
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
});
