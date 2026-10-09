import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/label-cache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, deleteCachedLabelPdf: vi.fn(async () => {}) };
});

import {
  buildNonContractShipmentJson,
  executeCanadaPostProxy,
  refundCanadaPostShipment,
} from '../src/lib/canadapost.js';
import { deleteCachedLabelPdf } from '../src/lib/label-cache.js';
import { extractAmount, parseShippingEmail } from '../src/lib/shipping-email.js';
import { isBatchCandidate } from '../src/lib/batch-shipping.js';
import { splitGapByBook } from '../src/lib/bigcartel-ledger-gap.js';
import { storeReversalsToRaise } from '../src/lib/store-reversals.js';

const SENDER = { name: 'Shop', phone: '4165550142', address1: '456 Montrose Ave', city: 'Toronto', province: 'ON', postalCode: 'M6G 3H1' };
const US_DEST = { name: 'A Customer', countryCode: 'US', address1: '1 Main St', city: 'Buffalo', province: 'NY', postalCode: '14607' };

describe('Canada Post customs value is per copy', () => {
  const build = customs => JSON.parse(buildNonContractShipmentJson({
    sender: SENDER, destination: US_DEST, weightKg: 0.9, customs,
    service: 'DOM.EP', customerNumber: '0001298882',
  })).deliverySpec;

  it('declares the per-copy figure for each of 3 copies (parcel total 75, not 25)', () => {
    const item = build({ value: 25, quantity: 3, hsCode: '4901.99' }).customs.skuList[0];
    expect(item.customsNumberOfUnits).toBe(3);
    expect(item.customsValuePerUnit).toBe(25);
  });
});

describe('a lost Canada Post purchase response', () => {
  beforeEach(() => {
    localStorage.setItem('lm-sheets-url', 'https://script.google.com/macros/s/test/exec');
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  const buy = () => executeCanadaPostProxy({
    targetEndpoint: 'https://api.canadapost-postescanada.ca/prod/devportal-portaildesdeveloppeurs/shipping/v1/1/1/shipments',
    jsonPayload: '{}', apiKey: 'k', apiSecret: 's', customerNumber: '0001298882', isTest: false,
  });

  it('is reported as unknown, never as "no label was purchased"', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).startsWith('/api/')) return new Response('<html>404</html>', { status: 404 });
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const err = await buy().catch(e => e);
    expect(err.outcomeUnknown).toBe(true);
    expect(err.message).toMatch(/may have been purchased/i);
    expect(err.message).not.toMatch(/no label was purchased/i);
    const calls = fetchMock.mock.calls.map(c => String(c[0]));
    expect(calls.filter(u => u.includes('script.google.com')).length).toBe(1);
    expect(calls.some(u => u.includes('canadapost-postescanada'))).toBe(false);
  });

  it('does not replay a purchase the local backend was still working on', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).startsWith('/api/')) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const err = await buy().catch(e => e);
    expect(err.outcomeUnknown).toBe(true);
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('script.google.com'))).toBe(false);
  });
});

describe('Canada Post refund failure', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); vi.clearAllMocks(); });
  const args = { shipmentId: '123', trackingPin: '1028972533688273', apiKey: 'k', apiSecret: 's', customerNumber: '0001298882' };

  it('keeps the cached label when the refund request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(refundCanadaPostShipment({ ...args, isTest: false })).rejects.toThrow(/refund request failed/i);
    expect(deleteCachedLabelPdf).not.toHaveBeenCalled();
  });

  it('drops the cached label once the refund went through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    await refundCanadaPostShipment({ ...args, isTest: false });
    expect(deleteCachedLabelPdf).toHaveBeenCalledWith('1028972533688273');
  });
});

describe('carrier email amount', () => {
  it('reads the total, not the subtotal', () => {
    const text = 'Subtotal: $20.00\nTax: $2.60\nTotal: $22.60';
    expect(extractAmount(text)).toBe(22.6);
    expect(extractAmount('Sub-total: $20.00\nGrand total: $22.60')).toBe(22.6);
    expect(parseShippingEmail({ subject: 'Receipt', body: `Tracking 1028972533688273\n${text}` }).amount).toBe(22.6);
  });
  it('does not read a lone subtotal as the amount', () => {
    expect(extractAmount('Subtotal: $20.00')).toBeNull();
  });
});

describe('batch shipping candidates', () => {
  const base = { num: '#AB-1', shipName: 'A', shipAddr1: '1 St', date: new Date().toISOString().slice(0, 10) };
  it('accepts a plain unshipped order', () => expect(isBatchCandidate(base)).toBe(true));
  it('skips local pick-ups, checkout pick-ups and dismissed orders', () => {
    expect(isBatchCandidate({ ...base, localPickup: true })).toBe(false);
    expect(isBatchCandidate({ ...base, shippingMethod: 'Local pick-up' })).toBe(false);
    expect(isBatchCandidate({ ...base, excludeFromShipping: true })).toBe(false);
    expect(isBatchCandidate(base, new Date(), { hidden: new Set(['AB-1', '#AB-1']) })).toBe(false);
  });
});

describe('mixed-title storefront orders', () => {
  it('splits per book at each book price', () => {
    const out = splitGapByBook({ lines: [
      { bookId: 'a', qty: 1, unitPrice: 20 },
      { bookId: 'b', qty: 2, unitPrice: 15 },
    ] });
    expect(out.parts).toEqual([{ bookId: 'a', qty: 1, price: 20 }, { bookId: 'b', qty: 2, price: 15 }]);
  });
  it('leaves single-book orders alone and blocks unmatched mixes', () => {
    expect(splitGapByBook({ lines: [{ bookId: 'a', qty: 1 }, { bookId: 'a', qty: 1 }] })).toBeNull();
    expect(splitGapByBook({ lines: [{ bookId: 'a', qty: 1 }, { bookId: 'b', qty: 1 }, { bookId: '', qty: 1 }] })).toEqual({ blocked: true });
  });
});

describe('partial then full refund', () => {
  const row = noted => ({ bookId: 'a', entry: { chan: 'Website', num: '#AB-1', sheetsId: 'bc-AB-1', qty: 1, storeReversalNoted: noted } });
  const refunded = [{ id: '1', attributes: { status: 'refunded', number: 'AB-1' } }];
  it('raises the full refund after a partial one was noted', () => {
    const found = storeReversalsToRaise(refunded, [row('partial')]);
    expect(found).toHaveLength(1);
    expect(found[0].full).toBe(true);
  });
  it('does not repeat a full note', () => {
    expect(storeReversalsToRaise(refunded, [row('full')])).toEqual([]);
    expect(storeReversalsToRaise(refunded, [row(true)])).toEqual([]);
  });
});
