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

describe('_tcTripReportReceipts', () => {
  const _tcTripReportReceipts = new Function(
    `${extractDecl('_tcTripReportReceipts')}\nreturn _tcTripReportReceipts;`,
  )();

  it('splits remote receipts (embeddable) from local ones (listed by name)', () => {
    const { remote, local } = _tcTripReportReceipts([
      { desc: 'Hotel', date: '2026-03-02', receipt: 'https://example.com/a.jpg' },
      { desc: 'Booth', date: '2026-03-03', receipt: 'local://receipts/booth-fee.pdf' },
    ]);
    expect(remote).toEqual([{ url: 'https://example.com/a.jpg', desc: 'Hotel', date: '2026-03-02' }]);
    expect(local).toEqual([{ name: 'booth-fee.pdf', desc: 'Booth' }]);
  });

  it('reads the multi-file receiptFiles array in preference to receipt', () => {
    const { remote } = _tcTripReportReceipts([
      { desc: 'Meals', receiptFiles: ['https://x.test/1.png', 'https://x.test/2.png'], receipt: 'https://x.test/ignored.png' },
    ]);
    expect(remote.map(r => r.url)).toEqual(['https://x.test/1.png', 'https://x.test/2.png']);
  });

  it('drops empty and non-http references rather than printing broken images', () => {
    const { remote, local } = _tcTripReportReceipts([
      { desc: 'A', receipt: '' },
      { desc: 'B', receiptFiles: [null, 'javascript:alert(1)', 'ftp://x/y.png'] },
      { desc: 'C' },
    ]);
    expect(remote).toEqual([]);
    expect(local).toEqual([]);
  });
});
