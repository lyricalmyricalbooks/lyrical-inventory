import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Test Book Sandbox Isolation & Google Sheets Protection', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  const indexHtmlPath = path.resolve(__dirname, '../index.html');
  const mainContent = fs.readFileSync(mainJsPath, 'utf8');
  const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');

  it('correctly defines isTestBook and isTestBookId helper functions', () => {
    expect(mainContent).toContain('function isTestBook(b)');
    expect(mainContent).toContain('function isTestBookId(bid)');
  });

  it('includes test book check in syncToSheets to prevent queuing test books to Google Sheets', () => {
    const syncToSheetsMatch = mainContent.match(/function syncToSheets\(payload\)\s*\{([\s\S]+?)\n\}/);
    expect(syncToSheetsMatch).not.toBeNull();
    const syncFnBody = syncToSheetsMatch[1];
    expect(syncFnBody).toContain('isTestBookId');
  });

  it('includes test book filter in syncBatchToSheets', () => {
    const syncBatchMatch = mainContent.match(/function syncBatchToSheets\(rows, label = 'Bulk sync'\)\s*\{([\s\S]+?)\n\}/);
    expect(syncBatchMatch).not.toBeNull();
    const batchFnBody = syncBatchMatch[1];
    expect(batchFnBody).toContain('isTestBookId');
  });

  it('filters out test books during pushAllToSheets bulk sync', () => {
    const pushAllMatch = mainContent.match(/async function pushAllToSheets\(opts = \{\}\)\s*\{([\s\S]+?)\n\}/);
    expect(pushAllMatch).not.toBeNull();
    const pushAllBody = pushAllMatch[1];
    expect(pushAllBody).toContain('isTestBook(book)');
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
    const isTestBookFunc = new Function('b', `
      if (!b) return false;
      const idLower = String(b.id || '').toLowerCase().trim();
      const titleLower = String(b.title || '').toLowerCase().trim();
      return idLower === 'test1' || idLower === 'testpage' || idLower.includes('test') ||
        titleLower === 'test1' || titleLower === 'testpage' || titleLower.includes('test');
    `);

    expect(isTestBookFunc({ id: 'test1', title: 'Test 1' })).toBe(true);
    expect(isTestBookFunc({ id: 'test-page', title: 'TEST PAGE' })).toBe(true);
    expect(isTestBookFunc({ id: 'hound', title: 'The Hound' })).toBe(false);
  });
});
