import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const mainJs = fs.readFileSync(path.join(process.cwd(), 'src/main.js'), 'utf8');

describe('Fair Print Kit — Adaptive Space and Sizing', () => {
  describe('Printable Payment QR Codes (printPaymentQRCodes)', () => {
    it('contains adaptive sizing logic based on card count and row count', () => {
      const fn = mainJs.slice(mainJs.indexOf('async function printPaymentQRCodes('));
      const body = fn.slice(0, fn.indexOf('\nwindow.printPaymentQRCodes ='));

      expect(body).toContain('const rowCount = Math.ceil(count / effectiveCols);');
      expect(body).toContain('effectiveCols = Math.min(effectiveCols, Math.max(1, count));');
      expect(body).toContain('computeQrSheetLayoutSizes(count, rowCount, effectiveCols, fitOnePage)');
    });

    it('renders author line when book has author', () => {
      const fn = mainJs.slice(mainJs.indexOf('async function printPaymentQRCodes('));
      const body = fn.slice(0, fn.indexOf('\nwindow.printPaymentQRCodes ='));

      expect(body).toContain('card-author');
      expect(body).toContain('book.author');
    });

    it('uses a full-page flex layout pinning the footer at the bottom', () => {
      const fn = mainJs.slice(mainJs.indexOf('async function printPaymentQRCodes('));
      const body = fn.slice(0, fn.indexOf('\nwindow.printPaymentQRCodes ='));

      expect(body).toContain('page-main');
      expect(body).toContain('min-height: 100vh;');
      expect(body).toContain('justify-content: space-between;');
      expect(body).toContain('margin-top: auto;');
    });
  });

  describe('QR sheet card sizing (computeQrSheetLayoutSizes)', () => {
    const fn = mainJs.slice(mainJs.indexOf('function computeQrSheetLayoutSizes('));
    const body = fn.slice(0, fn.indexOf('\nasync function printPaymentQRCodes('));

    it('defines large showcase dimensions for a single QR card (count === 1)', () => {
      expect(body).toMatch(/count === 1\)\s*\{[\s\S]*?qrFrameSize: '280px',/);
      expect(body).toMatch(/count === 1\)\s*\{[\s\S]*?qrRenderSize: 250,/);
      expect(body).toMatch(/count === 1\)\s*\{[\s\S]*?titleFontSize: '2.1rem',/);
      expect(body).toMatch(/count === 1\)\s*\{[\s\S]*?cardMaxWidth: '580px',/);
      expect(body).toMatch(/count === 1\)\s*\{[\s\S]*?cornerBracketSize: '12px',/);
    });

    it('gradually scales dimensions for 2 cards and 3 cards in a single row', () => {
      // 2 cards
      expect(body).toMatch(/count === 2[\s\S]*?qrFrameSize: '210px',/);
      expect(body).toMatch(/count === 2[\s\S]*?qrRenderSize: 185,/);
      expect(body).toMatch(/count === 2[\s\S]*?titleFontSize: '1.5rem',/);

      // 3 cards
      expect(body).toMatch(/count === 3[\s\S]*?qrFrameSize: '160px',/);
      expect(body).toMatch(/count === 3[\s\S]*?qrRenderSize: 140,/);
      expect(body).toMatch(/count === 3[\s\S]*?titleFontSize: '1.25rem',/);
    });

    it('contracts to compact dimensions for dense multi-row layouts', () => {
      expect(body).toMatch(/rowCount === 2[\s\S]*?qrFrameSize: '126px',/);
      expect(body).toMatch(/rowCount === 3[\s\S]*?qrFrameSize: '96px',/);
      expect(body).toMatch(/qrFrameSize: '78px',[\s\S]*?qrRenderSize: 64,/);
    });
  });

  describe('Book Sales Tracker (printSalesTracker)', () => {
    it('calculates total visual rows taking includeNotes into account', () => {
      const fn = mainJs.slice(mainJs.indexOf('function printSalesTracker('));
      const body = fn.slice(0, fn.indexOf('\nwindow.printSalesTracker ='));

      expect(body).toContain('const visualRows = numBooks * (includeNotes ? 2 : 1);');
    });

    it('provides expansive 220px tall row height and 18pt title for a single book row', () => {
      const fn = mainJs.slice(mainJs.indexOf('function printSalesTracker('));
      const body = fn.slice(0, fn.indexOf('\nwindow.printSalesTracker ='));

      expect(body).toMatch(/visualRows === 1\s*\)\s*\{[\s\S]*?rowHeight = 220;/);
      expect(body).toMatch(/visualRows === 1\s*\)\s*\{[\s\S]*?titleFontSize = '18pt';/);
      expect(body).toMatch(/visualRows === 1\s*\)\s*\{[\s\S]*?authorFontSize = '12.5pt';/);
      expect(body).toMatch(/visualRows === 1\s*\)\s*\{[\s\S]*?thHeight = 44;/);
      expect(body).toMatch(/visualRows === 1\s*\)\s*\{[\s\S]*?grandBoxW = '140px';/);
    });

    it('adaptively scales row heights down across 2, 4, 6, 9, and 15+ rows', () => {
      const fn = mainJs.slice(mainJs.indexOf('function printSalesTracker('));
      const body = fn.slice(0, fn.indexOf('\nwindow.printSalesTracker ='));

      expect(body).toMatch(/visualRows === 2\s*\)\s*\{[\s\S]*?rowHeight = 150;/);
      expect(body).toMatch(/visualRows <= 4\s*\)\s*\{[\s\S]*?rowHeight = 100;/);
      expect(body).toMatch(/visualRows <= 6\s*\)\s*\{[\s\S]*?rowHeight = 75;/);
      expect(body).toMatch(/visualRows <= 9\s*\)\s*\{[\s\S]*?rowHeight = 56;/);
      expect(body).toMatch(/visualRows <= 14\s*\)\s*\{[\s\S]*?rowHeight = 42;/);
      expect(body).toMatch(/rowHeight = 32;[\s\S]*?titleFontSize = '9.5pt';/);
    });

    it('applies effective row heights dynamically in the tally and total cells', () => {
      const fn = mainJs.slice(mainJs.indexOf('function printSalesTracker('));
      const body = fn.slice(0, fn.indexOf('\nwindow.printSalesTracker ='));

      expect(body).toContain('td.tally { background: #fff; height: ${effectiveTallyRowHeight}px; }');
      expect(body).toContain('td.total { background: #fdf0c8; height: ${effectiveTallyRowHeight}px; }');
      expect(body).toContain('min-height: calc(100vh - 0.4in);');
    });

    it('keeps the Date underline bar persistent with &nbsp; when date is omitted for handwriting', () => {
      const fn = mainJs.slice(mainJs.indexOf('function printSalesTracker('));
      const body = fn.slice(0, fn.indexOf('\nwindow.printSalesTracker ='));

      expect(body).toContain('dateLabel ? escapeHtml(dateLabel) : \'&nbsp;\'');
      expect(body).toContain('border-bottom: 1.5px solid #111;');
    });

    it('makes date input optional without forcing today() on modal open', () => {
      const openFn = mainJs.slice(mainJs.indexOf('window.openFairKitModal = function () {'));
      const openBody = openFn.slice(0, openFn.indexOf('};\n'));
      expect(openBody).not.toContain('dateInput.value = today()');

      const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
      expect(html).toMatch(/<label for="st-date">Date\s*<span[^>]*>\(optional\)<\/span><\/label>/);
    });
  });
});
