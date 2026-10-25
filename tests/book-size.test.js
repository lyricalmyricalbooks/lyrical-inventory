// @vitest-environment jsdom
// Each part of a book (its sales history above all) is saved as one cloud
// record with a hard size cap. Past it, every save for that book is refused,
// so the owner is warned at 70% and told plainly once it's over.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import {
  FIRESTORE_PART_LIMIT, RTDB_STRING_LIMIT, bookSizeMessage, bookSizeReport, partSizes,
} from '../src/lib/book-size.js';

// A website order with its shipping details, about 600 bytes stored.
const webRow = (i) => ({
  num: `#WEB-${i}`, chan: 'Website', qty: 1, price: 40, after: 0, notes: 'Big Cartel', date: '2026-10-01',
  shipName: 'Rae Example', shipEmail: 'rae@example.com', shipAddr1: '123 Long Street Name', shipAddr2: 'Apt 4',
  shipCity: 'Toronto', shipProvince: 'ON', shipPostal: 'M5V 2T6', shipCountry: 'Canada', shippingPaid: 12.5,
  subtotal: 40, discountCode: '', discountAmount: 0, merchandisePaid: 40, shippingMethod: 'Expedited Parcel',
  taxPaid: 5.2, totalPaid: 57.7, discountSource: '', payment: null, enteredBy: 'Publisher',
  sheetsId: `bc-WEB-${i}`, cur: 'CAD', recordedAt: '2026-10-01T12:00:00.000Z',
});
const historyOf = (n) => Array.from({ length: n }, (_, i) => webRow(i));

describe('bookSizeReport', () => {
  it('answers a small book from its length alone', () => {
    expect(bookSizeReport({ stock: 3, hist: historyOf(5) })).toMatchObject({ level: 'ok', part: null });
  });

  it('measures the fullest part in bytes, counting accented letters as more than one', () => {
    const sizes = partSizes({ stock: 1, hist: [{ notes: 'é' }], ledger: [] });
    expect(sizes.hist).toBe(JSON.stringify([{ notes: 'é' }]).length + 1);
    expect(sizes.ledger).toBe(2);
    expect(Object.keys(sizes)).toContain('metadata');
  });

  it('warns at 70% of a Firestore record and flags a book past the cap', () => {
    const rowBytes = partSizes({ hist: [webRow(1)] }).hist;
    const rowsFor = (share) => Math.ceil((FIRESTORE_PART_LIMIT * share) / rowBytes);
    expect(bookSizeReport({ hist: historyOf(rowsFor(0.6)) }).level).toBe('ok');
    const warn = bookSizeReport({ hist: historyOf(rowsFor(0.75)) });
    expect(warn).toMatchObject({ level: 'warn', part: 'hist', limit: FIRESTORE_PART_LIMIT });
    expect(warn.share).toBeGreaterThan(0.7);
    expect(bookSizeReport({ hist: historyOf(rowsFor(1.02)) }).level).toBe('over');
  });

  it('holds a Realtime Database book to its whole-book limit instead', () => {
    const report = bookSizeReport({ hist: historyOf(2000) }, { firestore: false });
    expect(report).toMatchObject({ level: 'ok', limit: RTDB_STRING_LIMIT });
  });

  it('tells the owner which record, how full, and that their changes are safe', () => {
    expect(bookSizeMessage({ level: 'ok' }, 'Harbour Lights')).toBe('');
    expect(bookSizeMessage({ level: 'warn', part: 'hist', share: 0.734 }, 'Harbour Lights'))
      .toBe('⚠ The sales history for Harbour Lights is 73% of what one cloud record holds. Older years need archiving before it fills.');
    expect(bookSizeMessage({ level: 'over', part: 'hist', share: 1.1 }, 'Harbour Lights'))
      .toMatch(/too big for one cloud record, so it can't save\. Your changes are kept on this device/);
  });
});

describe('saving a nearly full book', () => {
  let app;
  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'harbour' })] });
  }, 30000);
  beforeEach(() => { app.window._useFirestoreForBook = () => true; });

  it('warns once per session, still saves, and reports it', async () => {
    const rowBytes = partSizes({ hist: [webRow(1)] }).hist;
    await app.resetBook('harbour', { stock: 10, hist: historyOf(Math.ceil((FIRESTORE_PART_LIMIT * 0.75) / rowBytes)) });
    // resetBook's own save already warned; clear the slate and save a change.
    app.main.states.harbour.stock = 9;
    await app.main.saveState('harbour');
    expect(app.cloud.lastSave('harbour').state.stock).toBe(9);
    expect(app.cloud.errorReports.some(r => r.kind === 'book-size')).toBe(true);

    const toast = document.getElementById('toast');
    toast.textContent = '';
    app.main.states.harbour.stock = 8;
    await app.main.saveState('harbour');
    expect(toast.textContent).toBe('');
    expect(app.cloud.lastSave('harbour').state.stock).toBe(8);
  });
});
