import { describe, it, expect, beforeEach } from 'vitest';
import { csvCell } from '../src/lib/csv.js';
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
    // Declared as plain functions (not `window.x = function`) so eslint's
    // no-undef can see them — they reach the inline onclick handlers via
    // exposeLegacyInlineHandlers like every other handler.
    expect(mainContent).toContain('function calculateInventoryValuationData()');
    expect(mainContent).toContain('function openInventoryValuationModal()');
    expect(mainContent).toContain('function printInventoryValuationReport()');
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
      'book-1': { stock: 15, stores: [{ name: 'Bookstore A', outstanding: 8, sold: 2 }] }, // 8 consigned -> 23 total unsold
      'book-2': { stock: 20, stores: [] } // 0 consigned -> 20 total unsold
    };
    const mockDefaultState = () => ({ stock: 0, stores: [], hist: [] });
    const mockGetBookCurrencyCode = (book) => (book.currency === '€' ? 'EUR' : 'CAD');
    const mockFxRateCache = { 'EUR_CAD': 1.50 };

    // The export hands its finished CSV to downloadCsv() rather than building
    // an anchor itself, so this captures the call instead of mocking Blob and
    // the DOM. What the anchor does with it — attach, click, revoke — is
    // covered directly in tests/download.test.js and is not this test's job.
    let downloadTriggered = false;
    let createdBlobContent = '';
    let downloadFileName = '';
    const mockDownloadCsv = (csv, filename) => {
      downloadTriggered = true;
      createdBlobContent = csv;
      downloadFileName = filename;
    };

    let toastMessage = '';
    const mockShowToast = (msg) => { toastMessage = msg; };

    // Extract calculateInventoryValuationData and downloadInventoryValuationCSV
    const calcMatch = mainContent.match(/function calculateInventoryValuationData\(\)\s*\{([\s\S]+?)\n\}/);
    expect(calcMatch).not.toBeNull();

    const csvMatch = mainContent.match(/function downloadInventoryValuationCSV\(\)\s*\{([\s\S]+?)\n\}/);
    expect(csvMatch).not.toBeNull();

    // csvCell is injected as the real implementation, not a stand-in: the
    // column assertions below are exactly what it is responsible for getting
    // right, so stubbing it would test nothing.
    const factory = new Function(
      'today', 'BOOK_LIST', 'states', 'defaultState', 'getBookCurrencyCode', '_fxRateCache', 'csvCell', 'downloadCsv', 'showToast',
      `
        function isTestBook() { return false; }
        function calculateInventoryValuationData() { ${calcMatch[1]} }
        return function() { ${csvMatch[1]} }
      `
    );

    const exportFn = factory(
      mockToday, mockBookList, mockStates, mockDefaultState, mockGetBookCurrencyCode, mockFxRateCache, csvCell, mockDownloadCsv, mockShowToast
    );

    exportFn();

    expect(downloadTriggered).toBe(true);
    expect(downloadFileName).toBe('Lyrical_Inventory_Valuation_2026-07-14.csv');
    expect(toastMessage).toContain('Comprehensive Inventory Valuation CSV exported');

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

  it('divides total print run production cost by maxPrint to derive per-copy unit cost', () => {
    const mockToday = () => '2026-07-14';
    const mockBookList = [
      { id: 'hound', title: 'The Hound', isbn: '—', format: 'Paperback', listPrice: 65.00, productionCost: 15937.00, currency: 'CA$', maxPrint: 300 }
    ];
    const mockStates = {
      'hound': { stock: 86, stores: [{ name: 'Store 1', outstanding: 10, sold: 5 }] } // 10 consigned -> 96 unsold
    };
    const mockDefaultState = () => ({ stock: 0, stores: [], hist: [] });
    const mockGetBookCurrencyCode = () => 'CAD';
    const mockFxRateCache = {};

    const calcMatch = mainContent.match(/function calculateInventoryValuationData\(\)\s*\{([\s\S]+?)\n\}/);
    const factory = new Function(
      'BOOK_LIST', 'states', 'defaultState', 'getBookCurrencyCode', '_fxRateCache',
      `
        function isTestBook() { return false; }
        ${calcMatch[0]}
        return calculateInventoryValuationData;
      `
    );

    const calcFn = factory(mockBookList, mockStates, mockDefaultState, mockGetBookCurrencyCode, mockFxRateCache);
    const result = calcFn();

    expect(result.items.length).toBe(1);
    const item = result.items[0];
    expect(item.printRun).toBe(300);
    expect(item.unitCost).toBeCloseTo(53.1233, 4); // 15937 / 300
    expect(item.stockOnHand).toBe(86);
    expect(item.stockConsigned).toBe(10);
    expect(item.totalUnsold).toBe(96);
    expect(item.totalCostCAD).toBeCloseTo(5099.84, 2); // 96 * 53.1233
    expect(item.totalRetailCAD).toBe(6240.00); // 96 * 65.00
  });
});
