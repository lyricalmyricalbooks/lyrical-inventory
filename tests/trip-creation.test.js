import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { appSource, extractDecl } from './helpers/extract-decl.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');

describe('Business trip creation', () => {
  it('exposes a New trip entry point and a create/edit modal in the markup', () => {
    expect(html).toContain('id="tc-new-trip-btn"');
    expect(html).toContain('onclick="openNewTrip()"');
    expect(html).toContain('id="m-tc-new-trip"');
    // Every field the form collects.
    ['name', 'dest', 'start', 'end', 'budget', 'purpose', 'notes'].forEach(f => {
      expect(html).toContain(`id="tc-new-trip-${f}"`);
    });
    expect(html).toContain('onclick="saveNewTrip()"');
    expect(html).toContain('onclick="deleteTripRecord()"');
    expect(html).toContain('onclick="openEditTripDetails()"');
  });

  it('styles the new trip form and the planned-trip card states', () => {
    expect(css).toContain('.tc-trips-actions');
    expect(css).toContain('.tc-trip-form');
    expect(css).toContain('.tc-trip-form-full');
    expect(css).toContain('.tc-trip-badge-new');
    expect(css).toContain('.tc-trip-card-empty');
    expect(css).toContain('.tc-trip-form-err');
  });

  it('declares and exposes the trip record functions', () => {
    expect(appSource).toContain('function openNewTrip');
    expect(appSource).toContain('function openEditTripDetails');
    expect(appSource).toContain('function saveNewTrip');
    expect(appSource).toContain('function deleteTripRecord');
    expect(appSource).toContain('function tcNewTripValidate');
    expect(appSource).toContain('function _tcTripRecords');
    // Inline handlers only resolve if the function is on window.
    ['openNewTrip', 'saveNewTrip', 'deleteTripRecord', 'openEditTripDetails', 'tcNewTripValidate']
      .forEach(name => expect(appSource).toContain(name));
  });
});

describe('_tcTripRecords / _tcFindTripRecord', () => {
  const TAX_CENTER = {};
  const { _tcTripRecords, _tcFindTripRecord } = new Function(
    'TAX_CENTER',
    `${extractDecl('_tcTripRecords')}\n${extractDecl('_tcFindTripRecord')}\n` +
    'return { _tcTripRecords, _tcFindTripRecord };',
  )(TAX_CENTER);

  beforeEach(() => {
    delete TAX_CENTER.trips;
  });

  it('initialises the trips array lazily', () => {
    expect(_tcTripRecords()).toEqual([]);
    expect(Array.isArray(TAX_CENTER.trips)).toBe(true);
  });

  it('repairs a non-array trips value rather than throwing', () => {
    TAX_CENTER.trips = 'nope';
    expect(_tcTripRecords()).toEqual([]);
  });

  it('matches trip names case-insensitively and ignores surrounding space', () => {
    TAX_CENTER.trips = [{ name: 'Toronto Book Fair' }];
    expect(_tcFindTripRecord('  toronto book fair ')?.name).toBe('Toronto Book Fair');
    expect(_tcFindTripRecord('Ottawa')).toBe(null);
    expect(_tcFindTripRecord('')).toBe(null);
    expect(_tcFindTripRecord(undefined)).toBe(null);
  });
});

describe('Trip expense shortcut & printable report', () => {
  it('offers both actions from the trip detail modal', () => {
    expect(html).toContain('onclick="logExpenseForTrip()"');
    expect(html).toContain('onclick="exportTripPDF()"');
    // The shortcut needs a scroll target on the expense form card.
    expect(html).toContain('id="tc-expense-form-card"');
  });

  it('declares the shortcut and report functions', () => {
    expect(appSource).toContain('function logExpenseForTrip');
    expect(appSource).toContain('function exportTripPDF');
    expect(appSource).toContain('function _tcTripReportReceipts');
  });

  it('styles the scroll-target flash', () => {
    expect(css).toContain('.tc-flash-target');
    expect(css).toContain('@keyframes tc-flash-ring');
  });
});

describe('_tcTripReportReceipts / _tcIsPdfName', () => {
  const { _tcTripReportReceipts, _tcIsPdfName } = new Function(
    `${extractDecl('_tcTripReportReceipts')}\n${extractDecl('_tcIsPdfName')}\n` +
    'return { _tcTripReportReceipts, _tcIsPdfName };',
  )();

  it('tags local and remote receipts with everything needed to fetch them', () => {
    const refs = _tcTripReportReceipts([
      { desc: 'Hotel', date: '2026-03-02', receipt: 'https://example.com/a.jpg' },
      { desc: 'Booth', date: '2026-03-03', receipt: 'local://Business/booth-fee.pdf' },
    ]);
    expect(refs).toEqual([
      { source: 'remote', url: 'https://example.com/a.jpg', name: 'a.jpg', desc: 'Hotel', date: '2026-03-02' },
      { source: 'local', path: 'Business/booth-fee.pdf', name: 'booth-fee.pdf', desc: 'Booth', date: '2026-03-03' },
    ]);
  });

  it('strips a query string off a remote receipt name', () => {
    const [ref] = _tcTripReportReceipts([{ desc: 'X', receipt: 'https://cdn.test/r/scan.pdf?token=abc' }]);
    expect(ref.name).toBe('scan.pdf');
    expect(_tcIsPdfName(ref.name)).toBe(true);
  });

  it('reads the multi-file receiptFiles array in preference to receipt', () => {
    const refs = _tcTripReportReceipts([
      { desc: 'Meals', receiptFiles: ['https://x.test/1.png', 'https://x.test/2.png'], receipt: 'https://x.test/ignored.png' },
    ]);
    expect(refs.map(r => r.url)).toEqual(['https://x.test/1.png', 'https://x.test/2.png']);
  });

  it('drops empty and non-http references rather than printing broken images', () => {
    const refs = _tcTripReportReceipts([
      { desc: 'A', receipt: '' },
      { desc: 'B', receiptFiles: [null, 'javascript:alert(1)', 'ftp://x/y.png'] },
      { desc: 'C' },
    ]);
    expect(refs).toEqual([]);
  });

  it('detects PDFs by extension, including with a query or fragment', () => {
    expect(_tcIsPdfName('2026-05-11_Invoice429.pdf')).toBe(true);
    expect(_tcIsPdfName('scan.PDF')).toBe(true);
    expect(_tcIsPdfName('a.pdf?x=1')).toBe(true);
    expect(_tcIsPdfName('receipt.jpg')).toBe(false);
    expect(_tcIsPdfName('pdf-notes.png')).toBe(false);
    expect(_tcIsPdfName('')).toBe(false);
    expect(_tcIsPdfName(undefined)).toBe(false);
  });
});

describe('receipt embedding wiring', () => {
  it('rasterises PDFs and inlines images instead of listing filenames', () => {
    expect(appSource).toContain('function _tcPdfToImages');
    expect(appSource).toContain('function _tcResolveReceiptImages');
    expect(appSource).toContain('function _tcBlobToDataUrl');
    // The shared folder lookup viewLocalReceipt uses, now reusable.
    expect(appSource).toContain('function resolveLocalReceiptFile');
    expect(appSource).toContain('function ensurePdfJs');
  });

  it('opens the print window before awaiting, so the popup is not blocked', () => {
    const fn = extractDecl('exportTripPDF');
    expect(fn.indexOf('window.open')).toBeLessThan(fn.indexOf('await _tcResolveReceiptImages'));
  });

  it('names every unshowable receipt with a reason', () => {
    const fn = extractDecl('_tcResolveReceiptImages');
    expect(fn).toContain('receipt folder not connected');
    expect(fn).toContain('PDF could not be rendered');
    expect(fn).toContain('file could not be read');
  });
});
