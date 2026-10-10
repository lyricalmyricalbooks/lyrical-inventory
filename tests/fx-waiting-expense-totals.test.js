// A foreign-currency expense still waiting for its exchange rate must not be
// added to CAD totals 1:1 — it counts 0 and the user is told the totals aren't final.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

const BOOK = 'altrove';
let app;

beforeAll(async () => {
  app = await loadApp({ books: [makeBook({ id: BOOK, currency: '€' })] });
}, 30000);

const exp = (over) => ({ id: 'x' + Math.random(), date: '2025-03-01', cat: 'Printing', desc: 'd', amount: 100, ...over });

describe('calculateFinancials with expenses waiting for a rate', () => {
  it('counts a waiting foreign expense as 0 and reports it, leaving CAD / converted ones alone', async () => {
    await app.resetBook(BOOK, {
      expenses: [
        exp({ currency: 'EUR', amount: 100, baseAmount: null, fxMissing: true }), // waiting
        exp({ currency: 'EUR', amount: 100, baseAmount: 150, fxRate: 1.5 }),      // converted
        exp({ amount: 40 }),                                                       // CAD
      ],
    });
    app.main.TAX_CENTER.businessExpenses = [exp({ currency: 'USD', amount: 50, baseAmount: null, fxMissing: true })];
    const fin = app.main.calculateFinancials(2025);
    expect(fin.opex).toBe(190);
    expect(fin.fxWaitingCount).toBe(2);
    app.main.TAX_CENTER.businessExpenses = [];
  });

  it('the tax season export counts it 0 and says the totals are not final', async () => {
    await app.resetBook(BOOK, { expenses: [exp({ currency: 'EUR', amount: 100, baseAmount: null, fxMissing: true })] });
    let csv = '';
    const OrigBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class { constructor(parts) { csv = parts.join(''); } });
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    document.getElementById('tc-year') || document.body.insertAdjacentHTML('beforeend', '<select id="tc-year"><option value="2025">2025</option></select>');
    document.getElementById('tc-year').value = '2025';
    try { app.window.downloadFullTaxSeasonExport(); } finally { vi.stubGlobal('Blob', OrigBlob); }
    expect(csv).toMatch(/,0\.00,/);
    expect(csv).not.toMatch(/Printing,d,100\.00/);
    expect(csv).toContain('still waiting for an exchange rate');
    expect(app.toast()).toContain('still waiting for an exchange rate');
  });
});
