import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Inventory Valuation CSV Export', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  let downloadInventoryValuationCSV;

  beforeEach(() => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');

    // Extract window.downloadInventoryValuationCSV definition
    const funcMatch = mainContent.match(/window\.downloadInventoryValuationCSV\s*=\s*function\(\)\s*\{([\s\S]+?)\n\};/);
    expect(funcMatch).not.toBeNull();

    // Reconstruct the function with mock globals
    downloadInventoryValuationCSV = new Function(
      'today', 'BOOK_LIST', 'states', 'defaultState', 'getBookCurrencyCode', '_fxRateCache', 'Blob', 'document', 'showToast',
      `return function() { ${funcMatch[1]} }`
    );
  });

  it('correctly constructs a CSV matching the expected inventory assets and CAD conversions', () => {
    const mockToday = () => '2026-07-14';
    const mockBookList = [
      { id: 'book-1', title: 'Great Book', isbn: '123-456', productionCost: 10.00, currency: 'CA$' },
      { id: 'book-2', title: 'Euro Classic', isbn: '789-012', productionCost: 12.00, currency: '€' }
    ];
    const mockStates = {
      'book-1': { stock: 15 },
      'book-2': { stock: 20 }
    };
    const mockDefaultState = (book) => ({ stock: 0 });
    const mockGetBookCurrencyCode = (book) => {
      if (book.currency === 'CA$') return 'CAD';
      if (book.currency === '€') return 'EUR';
      return 'CAD';
    };
    const mockFxRateCache = {
      'EUR_CAD': 1.50
    };
    
    let createdBlobContent = '';
    let createdBlobType = '';
    class MockBlob {
      constructor(contentArray, options) {
        createdBlobContent = contentArray.join('');
        createdBlobType = options.type;
      }
    }

    let downloadTriggered = false;
    let downloadFileName = '';
    const mockDocument = {
      createElement: (tag) => {
        expect(tag).toBe('a');
        return {
          setAttribute: (name, val) => {
            if (name === 'download') downloadFileName = val;
          },
          click: () => {
            downloadTriggered = true;
          }
        };
      },
      body: {
        appendChild: () => {},
        removeChild: () => {}
      }
    };

    let toastMessage = '';
    const mockShowToast = (msg) => {
      toastMessage = msg;
    };

    // Instantiate and execute
    const exportFn = downloadInventoryValuationCSV(
      mockToday, mockBookList, mockStates, mockDefaultState, mockGetBookCurrencyCode, mockFxRateCache, MockBlob, mockDocument, mockShowToast
    );
    global.URL = {
      createObjectURL: () => 'blob:mock-url'
    };

    exportFn();

    expect(downloadTriggered).toBe(true);
    expect(downloadFileName).toBe('Lyrical_Inventory_Valuation_2026-07-14.csv');
    expect(toastMessage).toContain('Inventory Valuation CSV exported');
    expect(createdBlobType).toBe('text/csv;charset=utf-8;');
    
    // Validate CSV rows
    const lines = createdBlobContent.split('\n');
    expect(lines[0]).toBe('Lyricalmyrical Book Inventory Valuation Report');
    expect(lines[1]).toBe('Generated on: 2026-07-14');
    expect(lines[3]).toBe('Book ID,Title,ISBN,Stock on Hand,Currency,Unit Production Cost (Native),Total Asset Value (Native),CAD Exchange Rate,Total Asset Value (CAD)');
    
    // Book 1: 15 stock * 10 cost = 150 native * 1.0 rate = 150 CAD
    expect(lines[4]).toBe('"book-1","Great Book","123-456",15,"CAD",10.00,150.00,1.0000,150.00');
    // Book 2: 20 stock * 12 cost = 240 native * 1.5 rate = 360 CAD
    expect(lines[5]).toBe('"book-2","Euro Classic","789-012",20,"EUR",12.00,240.00,1.5000,360.00');
  });
});
