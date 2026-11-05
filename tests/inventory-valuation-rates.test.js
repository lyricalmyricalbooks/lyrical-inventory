// The inventory valuation reports in CAD. A euro book read before any live
// exchange rate was fetched used to count one euro as one dollar, and a
// write-off from that screen booked the deduction at 1.0000.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';

let app;
let valuation;

beforeAll(async () => {
  app = await loadApp({ books: [
    makeBook({ id: 'euro', title: 'Euro Book', currency: '€', listPrice: 40, maxPrint: 100 }),
    makeBook({ id: 'cad', title: 'Dollar Book', currency: 'CA$', listPrice: 30, maxPrint: 10 }),
  ] });
  valuation = await import('../src/features/inventory-valuation.js');
}, 30000);

describe('inventory valuation before a live rate is fetched', () => {
  it('converts euro stock with the register\'s saved rate, not one for one', () => {
    for (const k of Object.keys(app.main._fxRateCache)) if (k !== 'CAD_CAD') delete app.main._fxRateCache[k];
    const euro = valuation.calculateInventoryValuationData().items.find(i => i.id === 'euro');
    expect(euro.fxMissing).toBe(false);
    expect(euro.fxRate).toBeGreaterThan(1.2);
    expect(euro.totalRetailCAD).toBeCloseTo(euro.totalRetailNative * euro.fxRate, 6);
  });

  it('leaves a currency with no rate at all out of the CAD totals', async () => {
    app.main.BOOKS.euro.currency = 'XYZ';
    try {
      const data = valuation.calculateInventoryValuationData();
      const odd = data.items.find(i => i.id === 'euro');
      expect(odd.fxMissing).toBe(true);
      expect(odd.totalRetailCAD).toBe(0);
    } finally {
      app.main.BOOKS.euro.currency = '€';
    }
  });
});
