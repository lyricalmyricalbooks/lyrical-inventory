import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Robust Inventory Valuation Suite & CSV Export', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  const indexHtmlPath = path.resolve(__dirname, '../index.html');
  const mainContent = fs.readFileSync(mainJsPath, 'utf8');
  const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');

  it('declares calculateInventoryValuationData, openInventoryValuationModal, and printInventoryValuationReport in main.js', () => {
    expect(mainContent).toContain('function calculateInventoryValuationData()');
    expect(mainContent).toContain('window.openInventoryValuationModal = function()');
    expect(mainContent).toContain('window.printInventoryValuationReport = function()');
  });

  it('includes the Inventory Valuation Asset Report modal in index.html', () => {
    expect(indexContent).toContain('id="m-inventory-valuation-modal"');
    expect(indexContent).toContain('id="iv-stat-cost-cad"');
    expect(indexContent).toContain('id="iv-stat-retail-cad"');
    expect(indexContent).toContain('id="iv-stat-unsold-units"');
    expect(indexContent).toContain('id="iv-stat-margin-pct"');
    expect(indexContent).toContain('id="iv-modal-table-body"');
  });

  it('correctly constructs a comprehensive multi-column CSV with cost basis, MSRP, consignment stock, and totals row', () => {
    const mockToday = () => '2026-07-14';
    const mockBookList = [
      { id: 'book-1', title: 'Great Book', isbn: '123-456', format: 'Hardcover', listPrice: 30.00, productionCost: 10.00, currency: 'CA$', maxPrint: 100 },
      { id: 'book-2', title: 'Euro Classic', isbn: '789-012', format: 'Paperback', listPrice: 20.00, productionCost: 5.00, currency: '€', maxPrint: 50 }
    ];
    const mockStates = {
      'book-1': { stock: 15, ledger: [{ storeName: 'Bookstore A', qty: 10, sold: 2 }] }, // 8 consigned -> 23 total unsold
      'book-2': { stock: 20, ledger: [] } // 0 consigned -> 20 total unsold
    };
    const mockDefaultState = () => ({ stock: 0, ledger: [], hist: [] });
    const mockGetBookCurrencyCode = (book) => (book.currency === '€' ? 'EUR' : 'CAD');
    const mockFxRateCache = { 'EUR_CAD': 1.50 };

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
      body: { appendChild: () => {}, removeChild: () => {} }
    };

    let toastMessage = '';
    const mockShowToast = (msg) => { toastMessage = msg; };

    // Extract calculateInventoryValuationData and downloadInventoryValuationCSV
    const calcMatch = mainContent.match(/function calculateInventoryValuationData\(\)\s*\{([\s\S]+?)\n\}/);
    expect(calcMatch).not.toBeNull();

    const csvMatch = mainContent.match(/window\.downloadInventoryValuationCSV\s*=\s*function\(\)\s*\{([\s\S]+?)\n\};/);
    expect(csvMatch).not.toBeNull();

    const factory = new Function(
      'today', 'BOOK_LIST', 'states', 'defaultState', 'getBookCurrencyCode', '_fxRateCache', 'Blob', 'document', 'showToast',
      `
        function isTestBook() { return false; }
        function calculateInventoryValuationData() { ${calcMatch[1]} }
        return function() { ${csvMatch[1]} }
      `
    );

    global.URL = { createObjectURL: () => 'blob:mock-url' };

    const exportFn = factory(
      mockToday, mockBookList, mockStates, mockDefaultState, mockGetBookCurrencyCode, mockFxRateCache, MockBlob, mockDocument, mockShowToast
    );

    exportFn();

    expect(downloadTriggered).toBe(true);
    expect(downloadFileName).toBe('Lyrical_Inventory_Valuation_2026-07-14.csv');
    expect(toastMessage).toContain('Comprehensive Inventory Valuation CSV exported');
    expect(createdBlobType).toBe('text/csv;charset=utf-8;');

    const lines = createdBlobContent.split('\n');
    expect(lines[0]).toBe('Lyricalmyrical Book Inventory Valuation Report');
    expect(lines[1]).toBe('Generated on: 2026-07-14');
    expect(lines[2]).toContain('Active Titles: 2 | Total Unsold Units: 43 (35 Warehouse / 8 Consigned)');
    expect(lines[3]).toContain('Total Balance Sheet Inventory Asset Cost: CAD $380.00');

    // Header line
    expect(lines[5]).toBe('Book ID,Title,ISBN,Binding / Format,Print Run,Stock On-Hand (Warehouse),Stock Consigned (Stores),Total Unsold Inventory,Lifetime Sold Units,Currency,Unit Print Cost (Native),Unit Retail Price (Native),Unit Margin (Native),Unit Margin %,FX Rate (CAD),On-Hand Asset Value Cost (CAD),Consigned Asset Value Cost (CAD),TOTAL ASSET VALUE COST (CAD),TOTAL RETAIL VALUE (CAD),POTENTIAL GROSS PROFIT (CAD)');

    // Book 1: 15 on hand, 8 consigned = 23 unsold. Unit cost 10, list price 30. FX=1.0. Total cost=230 CAD, total retail=690 CAD
    expect(lines[6]).toBe('"book-1","Great Book","123-456","Hardcover",100,15,8,23,2,"CAD",10.00,30.00,20.00,66.7%,1.0000,150.00,80.00,230.00,690.00,460.00');

    // Book 2: 20 on hand, 0 consigned = 20 unsold. Unit cost 5 EUR, list price 20 EUR. FX=1.5. Total cost=150 CAD, total retail=600 CAD
    expect(lines[7]).toBe('"book-2","Euro Classic","789-012","Paperback",50,20,0,20,0,"EUR",5.00,20.00,15.00,75.0%,1.5000,150.00,0.00,150.00,600.00,450.00');

    // Totals row
    expect(lines[8]).toContain('TOTALS,"Total Active Titles: 2",,,150,35,8,43,2,CAD,,,,,,300.00,80.00,380.00,1290.00,910.00');
  });
});
