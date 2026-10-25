import { describe, it, expect } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';

// The shipping hub's P&L cards, its ledger and the ledger's CSV export all
// filter orders through one shared check, so the three always count the same
// orders. These pin that check's rules.
function harness() {
  return buildHarness({
    names: ['shipAnalysisWeightBand', 'passesShipAnalysisFilters'],
    deps: {
      normalizeShippingOrderNumber: (n) => String(n || '').replace(/^#/, ''),
      parseCarrierInfo: (desc) => ({ provider: String(desc).split(' ')[0] }),
      shipmentRegion: (country) => (country === 'CA' ? 'Canada' : 'International'),
      getWeightInKg: (qty, book) => qty * (book?.kg ?? 0),
    },
    moduleState: `
      let shipAnalysisMarginFilter = 'all';
      let shipAnalysisCarrierFilter = 'all';
      let shipAnalysisRegionFilter = 'all';
      let shipAnalysisWeightFilter = 'all';
      function set(f) {
        shipAnalysisMarginFilter = f.margin || 'all';
        shipAnalysisCarrierFilter = f.carrier || 'all';
        shipAnalysisRegionFilter = f.region || 'all';
        shipAnalysisWeightFilter = f.weight || 'all';
      }`,
    returns: '{ shipAnalysisWeightBand, passesShipAnalysisFilters, set }',
  });
}

const postage = { '101': [{ desc: 'UPS label', amount: 12 }] };
const linkedFor = (num) => (num && postage[num]) || [];
const books = { b1: { kg: 0.4 } };
const bookFor = (id) => books[id];

describe('shipAnalysisWeightBand', () => {
  it('uses the weight table buckets, upper edge inclusive', () => {
    const { shipAnalysisWeightBand } = harness();
    expect(shipAnalysisWeightBand(0.49)).toBe('Under 0.5 kg');
    expect(shipAnalysisWeightBand(0.5)).toBe('0.5 - 1 kg');
    expect(shipAnalysisWeightBand(1)).toBe('0.5 - 1 kg');
    expect(shipAnalysisWeightBand(2)).toBe('1 - 2 kg');
    expect(shipAnalysisWeightBand(2.01)).toBe('Over 2 kg');
    expect(shipAnalysisWeightBand(NaN)).toBe('Over 2 kg');
  });
});

describe('passesShipAnalysisFilters', () => {
  const order = { num: '#101', shippingPaid: 10, shipCountry: 'CA', bookId: 'b1', qty: 1 };

  it('lets every order through with no filter set', () => {
    const h = harness();
    expect(h.passesShipAnalysisFilters({}, linkedFor, bookFor)).toBe(true);
  });

  it('splits loss and profit on what the customer paid against linked postage', () => {
    const h = harness();
    h.set({ margin: 'loss' });
    expect(h.passesShipAnalysisFilters(order, linkedFor, bookFor)).toBe(true);
    h.set({ margin: 'profit' });
    expect(h.passesShipAnalysisFilters(order, linkedFor, bookFor)).toBe(false);
    expect(h.passesShipAnalysisFilters({ ...order, manualPostagePaid: true, postagePaid: 4 }, linkedFor, bookFor)).toBe(true);
  });

  it('drops orders with no postage from margin views, and "missing" keeps unpaid shipping', () => {
    const h = harness();
    h.set({ margin: 'loss' });
    expect(h.passesShipAnalysisFilters({ ...order, num: '#999' }, linkedFor, bookFor)).toBe(false);
    h.set({ margin: 'missing' });
    expect(h.passesShipAnalysisFilters(order, linkedFor, bookFor)).toBe(false);
    expect(h.passesShipAnalysisFilters({ ...order, shippingPaid: 0 }, linkedFor, bookFor)).toBe(true);
  });

  it('matches carrier, region and weight band', () => {
    const h = harness();
    h.set({ carrier: 'UPS', region: 'Canada', weight: 'Under 0.5 kg' });
    expect(h.passesShipAnalysisFilters(order, linkedFor, bookFor)).toBe(true);
    h.set({ carrier: 'Unlinked' });
    expect(h.passesShipAnalysisFilters(order, linkedFor, bookFor)).toBe(false);
    expect(h.passesShipAnalysisFilters({ ...order, num: '#999' }, linkedFor, bookFor)).toBe(true);
    h.set({ carrier: 'Manual Override' });
    expect(h.passesShipAnalysisFilters({ ...order, manualPostagePaid: true }, linkedFor, bookFor)).toBe(true);
    h.set({ region: 'International' });
    expect(h.passesShipAnalysisFilters(order, linkedFor, bookFor)).toBe(false);
    h.set({ weight: '0.5 - 1 kg' });
    expect(h.passesShipAnalysisFilters({ ...order, qty: 2 }, linkedFor, bookFor)).toBe(true);
    expect(h.passesShipAnalysisFilters(order, linkedFor, bookFor)).toBe(false);
  });
});
