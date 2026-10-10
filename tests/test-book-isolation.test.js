import { describe, it, expect } from 'vitest';
import { appSource, extractDecl } from './helpers/extract-decl.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Test Book Sandbox Isolation & Google Sheets Protection', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  const indexHtmlPath = path.resolve(__dirname, '../index.html');
  const mainContent = appSource;
  const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');

  it('correctly defines isTestBook and isTestBookId helper functions', () => {
    expect(mainContent).toContain('function isTestBook(b)');
    expect(mainContent).toContain('function isTestBookId(bid)');
  });

  it('includes test book check in syncToSheets to prevent queuing test books to Google Sheets', () => {
    const syncToSheetsMatch = mainContent.match(/function syncToSheets\(payload, opts = \{\}\)\s*\{([\s\S]+?)\n\}/);
    expect(syncToSheetsMatch).not.toBeNull();
    const syncFnBody = syncToSheetsMatch[1];
    expect(syncFnBody).toContain('isTestBookId');
  });

  it('includes test book filter in syncBatchToSheets', () => {
    const syncBatchMatch = mainContent.match(/function syncBatchToSheets\(rows, label = 'Bulk sync', opts = \{\}\)\s*\{([\s\S]+?)\n\}/);
    expect(syncBatchMatch).not.toBeNull();
    const batchFnBody = syncBatchMatch[1];
    expect(batchFnBody).toContain('isTestBookId');
  });

  it('filters out test books during pushAllToSheets bulk sync', () => {
    const pushAllMatch = mainContent.match(/async function pushAllToSheets\(opts = \{\}\)\s*\{([\s\S]+?)\n\}/);
    expect(pushAllMatch).not.toBeNull();
    const pushAllBody = pushAllMatch[1];
    // Every row comes from liveSheetRowsForBook, which refuses the practice book.
    expect(pushAllBody).toContain('liveSheetRowsForBook(bid');
    const rowsMatch = mainContent.match(/function liveSheetRowsForBook\(bid[^)]*\)\s*\{([\s\S]+?)\n\}/);
    expect(rowsMatch).not.toBeNull();
    expect(rowsMatch[1]).toContain('isTestBook(book) || isTestBookId(bid)');
  });

  it('excludes test books from calculateFinancials report calculation', () => {
    const calcFinMatch = mainContent.match(/function calculateFinancials\(year\)\s*\{([\s\S]+?)\n\}/);
    expect(calcFinMatch).not.toBeNull();
    const calcFinBody = calcFinMatch[1];
    expect(calcFinBody).toContain('isTestBook(book)');
  });

  it('excludes test books from downloadTaxReport and full tax season exports', () => {
    const taxReportMatch = mainContent.match(/function downloadTaxReport\(\)\s*\{([\s\S]+?)\n\}/);
    expect(taxReportMatch).not.toBeNull();
    expect(taxReportMatch[1]).toContain('isTestBook(book)');
  });

  it('displays the ISOLATED TEST SANDBOX badge in index.html', () => {
    expect(indexContent).toContain('ISOLATED TEST SANDBOX');
    expect(indexContent).toContain('Test book activity is strictly blocked from syncing to Google Sheets');
  });

  it('executes function logic correctly for test books', () => {
    const isTestBookFunc = new Function(`${extractDecl('isTestBook')}; return isTestBook;`)();

    expect(isTestBookFunc({ id: 'test1', title: 'Test 1' })).toBe(true);
    expect(isTestBookFunc({ id: 'test-page', title: 'TEST PAGE' })).toBe(true);
    expect(isTestBookFunc({ id: 'hound', title: 'The Hound' })).toBe(false);
    expect(isTestBookFunc({ id: 'test', title: 'TEST PAGE' })).toBe(true);
    expect(isTestBookFunc({ id: 'legacy', title: '  Test Page  ' })).toBe(true);
    expect(isTestBookFunc({ id: 'test', title: 'Renamed sandbox' })).toBe(true);
    expect(isTestBookFunc({ id: 'greatest', title: 'Greatest Hits' })).toBe(false);
    expect(isTestBookFunc({ id: 'contest', title: 'Contest' })).toBe(false);
    expect(isTestBookFunc({ id: 'sample', title: 'Sample', isTest: true })).toBe(true);
  });

  it('recognizes sandbox IDs before catalog loading and renamed sandbox titles after loading', () => {
    const books = { legacy: { id: 'legacy', title: 'TEST PAGE' } };
    const isTestId = new Function('BOOKS', `${extractDecl('isTestBook')}\n${extractDecl('isTestBookId')}\nreturn isTestBookId;`)(books);
    for (const id of ['test', ' TEST ', 'test-page', 'testpage', 'test1', 'legacy', 'TEST PAGE']) {
      expect(isTestId(id), id).toBe(true);
    }
    expect(isTestId('contest')).toBe(false);
    expect(isTestId('greatest')).toBe(false);
  });

  it('renders TEST PAGE only in the sandbox catalog while keeping real books in production', () => {
    const containers = { 'catalog-list': { innerHTML: '' }, 'test-catalog-list': { innerHTML: '' } };
    const books = [
      { id: 'test', title: 'TEST PAGE', currency: '€', listPrice: 17 },
      { id: 'greatest', title: 'Greatest Hits', currency: 'CA$', listPrice: 20 },
    ];
    const render = new Function('$', 'BOOK_LIST', 'escapeHtml', `${extractDecl('isTestBook')}\n${extractDecl('renderCatalogList')}\nreturn renderCatalogList;`)(
      id => containers[id], books, text => String(text),
    );
    render();
    const live = containers['catalog-list'].innerHTML;
    const sandbox = containers['test-catalog-list'].innerHTML;
    expect(live).not.toContain('TEST PAGE');
    expect(live).toContain('Greatest Hits');
    expect(sandbox).toContain('TEST PAGE');
    expect(sandbox).not.toContain('Greatest Hits');
  });
});
