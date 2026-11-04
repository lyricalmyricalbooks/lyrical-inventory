// The Tax Season Export's revenue must agree with the Tax Centre's gross sales
// for the same year: each foreign sale at its own date's rate (not today's),
// plus customer-paid shipping, which is already CAD and never converted.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'altrove';
let app;

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: BOOK, title: 'Altrove', currency: '€' })] });
}, 30000);

afterEach(() => {
  for (const k of Object.keys(app.main._fxRateCache)) {
    if (k.startsWith('EUR_CAD')) delete app.main._fxRateCache[k];
  }
});

function exportCsv(year) {
  let csv = '';
  const OrigBlob = globalThis.Blob;
  vi.stubGlobal('Blob', class { constructor(parts) { csv = parts.join(''); } });
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
  if (!document.getElementById('tc-year')) {
    document.body.insertAdjacentHTML('beforeend', `<select id="tc-year"><option value="${year}">${year}</option></select>`);
  }
  document.getElementById('tc-year').value = year;
  try { app.window.downloadFullTaxSeasonExport(); } finally { vi.stubGlobal('Blob', OrigBlob); }
  return csv;
}

describe('Tax Season Export revenue', () => {
  it('converts each sale at its own date\'s rate and adds customer shipping unconverted', async () => {
    Object.assign(app.main._fxRateCache, {
      EUR_CAD: 9, // today's rate: must not be used for a dated sale
      'EUR_CAD@2025-03-10': 1.5,
      'EUR_CAD@2025-06-20': 1.4,
    });
    await app.resetBook(BOOK, {
      hist: [
        { num: 1, date: '2025-03-10', qty: 2, price: 20, shippingPaid: 7 },
        { num: 2, date: '2025-06-20', qty: 1, price: 10 },
        { num: 3, date: '2025-07-01', qty: 1, price: 50, voided: true },
      ],
    });
    const csv = exportCsv('2025');
    // 40 × 1.5 + 10 × 1.4 + 7 shipping (CAD, not × rate) = 81.00
    expect(csv).toMatch(/"Altrove",81\.00,/);
  });

  it('converts an artist payout at its own date\'s rate', async () => {
    Object.assign(app.main._fxRateCache, { EUR_CAD: 9, 'EUR_CAD@2025-04-02': 1.5 });
    await app.resetBook(BOOK, {
      artistPayouts: [{ id: 'p1', date: '2025-04-02', amount: 100, method: 'Bank transfer' }],
    });
    const csv = exportCsv('2025');
    expect(csv).toMatch(/2025-04-02,"Altrove","Artist Payout",[^\n]*,150\.00,/);
  });
});
