// Shippo's integration rules: parcel sizes go as strings, and a shown rate is
// only bought for the form it was quoted for, within Shippo's 7-day rate life.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toShippoParcel, shippoQuoteProblem, SHIPPO_RATE_MAX_AGE_MS } from '../src/lib/carriers/shippo-rules.js';
import { loadApp, makeBook } from './helpers/load-app.js';

describe('toShippoParcel', () => {
  it('sends sizes and weight as plain strings and keeps the units', () => {
    expect(toShippoParcel({ length: 10, width: 8, height: 2.4000000001, distance_unit: 'cm', weight: 0.1 + 0.2, mass_unit: 'kg' }))
      .toEqual({ length: '10', width: '8', height: '2.4', distance_unit: 'cm', weight: '0.3', mass_unit: 'kg' });
  });
  it('leaves strings alone and does not invent missing fields', () => {
    expect(toShippoParcel({ length: '12', weight: '1.5' })).toEqual({ length: '12', weight: '1.5' });
  });
});

describe('shippoQuoteProblem', () => {
  const now = 1_800_000_000_000;
  it('accepts a fresh quote for the same form', () => {
    expect(shippoQuoteProblem({ fingerprint: 'a', at: now - 1000 }, { fingerprint: 'a', now })).toBeNull();
  });
  it('names each reason a quote cannot be bought', () => {
    expect(shippoQuoteProblem(null, { fingerprint: 'a', now })).toBe('missing');
    expect(shippoQuoteProblem({ fingerprint: 'a', at: now }, { fingerprint: 'b', now })).toBe('changed');
    expect(shippoQuoteProblem({ fingerprint: 'a', at: now - SHIPPO_RATE_MAX_AGE_MS }, { fingerprint: 'a', now })).toBe('expired');
    expect(shippoQuoteProblem({ fingerprint: 'a', at: now + 60_000 }, { fingerprint: 'a', now })).toBe('expired');
  });
});

describe('the Shipping tab follows the rules', () => {
  let app, shipping, fetchMock;
  const $ = (id) => document.getElementById(id);
  const RATE = { object_id: 'rate_1', provider: 'Canada Post', servicelevel: { name: 'Expedited' }, amount: '14.25', currency: 'CAD', estimated_days: 2 };

  beforeAll(async () => {
    app = await loadApp({ books: [makeBook({ id: 'a' })] });
    shipping = await import('../src/features/shipping.js');
  }, 30000);

  beforeEach(() => {
    app.main.TAX_CENTER.settings = { shippoKey: 'shippo_test_x' };
    const fill = {
      'sf-name': 'Shop', 'sf-phone': '4165550142', 'sf-street1': '456 Montrose Ave', 'sf-city': 'Toronto', 'sf-state': 'ON', 'sf-zip': 'M6G 3H1', 'sf-country': 'CA',
      'st-name': 'A Customer', 'st-phone': '9055550100', 'st-street1': '141 Rothsay Ave', 'st-city': 'Hamilton', 'st-state': 'ON', 'st-zip': 'L8M 3G5', 'st-country': 'CA',
      'sp-length': '23', 'sp-width': '15', 'sp-height': '2', 'sp-weight': '0.5',
    };
    for (const [id, value] of Object.entries(fill)) $(id).value = value;
    $('toast').textContent = '';
    fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/shipments/')) return new Response(JSON.stringify({ rates: [RATE] }), { status: 200 });
      return new Response('{}', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('quotes the parcel with string sizes and weight', async () => {
    await shipping.calculateShippoRates();
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/shipments/'));
    expect(call).toBeTruthy();
    const parcel = JSON.parse(call[1].body).parcels[0];
    for (const key of ['length', 'width', 'height', 'weight']) expect(typeof parcel[key], key).toBe('string');
    expect(parcel).toMatchObject({ length: '23', weight: '0.5' });
  });

  it('refuses to buy a rate once the address changes, and clears the old prices', async () => {
    await shipping.calculateShippoRates();
    expect($('ship-results-list').innerHTML).toContain('rate-buy-btn');
    $('st-street1').value = '9 Other St';
    fetchMock.mockClear();
    await shipping.buyShippoLabel('rate_1', 'Canada Post', 'Expedited', 14.25, 'CAD');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/transactions'))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect($('ship-results-list').innerHTML).toBe('');
    expect($('toast').textContent).toMatch(/changed since these prices/);
  });

  it('still lets an unchanged quote go on to the address check', async () => {
    await shipping.calculateShippoRates();
    fetchMock.mockClear();
    // Not awaited: past the guard it stops at a confirm dialog nobody answers here.
    shipping.buyShippoLabel('rate_1', 'Canada Post', 'Expedited', 14.25, 'CAD');
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('addresses'))).toBe(true));
    expect($('toast').textContent).not.toMatch(/changed since these prices/);
  });
});
