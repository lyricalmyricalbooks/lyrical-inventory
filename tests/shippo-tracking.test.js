// Following parcels from every carrier, not only Canada Post: rows with another
// carrier are tracked through Shippo, and Shippo's answer is read by its
// status, never by matching its words.
import { describe, it, expect } from 'vitest';
import { shipmentsToFollow, readDelivery } from '../src/lib/delivery-watch.js';
import { readShippoTrack, shippoCarrierToken } from '../src/lib/carriers/shippo-rules.js';
import { enrichShippoExpense } from '../src/lib/shipping-reconciliation.js';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const row = (entry) => ({ bookId: 'b', entry: { shipped: true, shippedDate: '2026-09-18', ...entry } });
const ups = row({ trackingNumber: '1Z999AA10123456784', shippoCarrier: 'ups' });
const cp = row({ trackingNumber: '1234567890123456' });
const carrierFor = (entry) => entry.shippoCarrier || '';

describe('shippoCarrierToken', () => {
  it('turns a provider name into Shippo’s carrier token', () => {
    expect(shippoCarrierToken('Canada Post')).toBe('canada_post');
    expect(shippoCarrierToken('DHL Express')).toBe('dhl_express');
    expect(shippoCarrierToken('USPS')).toBe('usps');
    expect(shippoCarrierToken('')).toBe('');
  });
});

describe('which parcels go to Shippo', () => {
  it('sends another carrier’s parcel to Shippo with its carrier', () => {
    const picked = shipmentsToFollow([ups, cp], { now: NOW, shippoCarrierFor: carrierFor });
    expect(picked.map(p => [p.source, p.carrier || '', p.pin])).toEqual([
      ['shippo', 'ups', '1Z999AA10123456784'],
      ['canadapost', '', '1234567890123456'],
    ]);
  });

  it('skips a parcel whose carrier is unknown, and everything when Shippo is off', () => {
    expect(shipmentsToFollow([row({ trackingNumber: '1Z999AA10123456784' })], { now: NOW, shippoCarrierFor: carrierFor })).toEqual([]);
    expect(shipmentsToFollow([ups], { now: NOW })).toEqual([]);
  });

  it('tracks a Canada Post parcel through Shippo when Canada Post’s own API is not set up', () => {
    const picked = shipmentsToFollow([cp], { now: NOW, canadaPost: false, shippoCarrierFor: carrierFor });
    expect(picked).toMatchObject([{ source: 'shippo', carrier: 'canada_post', pin: '1234567890123456' }]);
  });

  it('never follows a test label', () => {
    expect(shipmentsToFollow([row({ trackingNumber: 'SHIPPO_TRANSIT', shippoCarrier: 'shippo', trackingSimulated: true })],
      { now: NOW, shippoCarrierFor: carrierFor })).toEqual([]);
  });
});

describe('reading Shippo’s answer', () => {
  const track = (tracking_status) => ({ tracking_status });

  it('reads a delivery by status, with the date', () => {
    const r = readDelivery(readShippoTrack(track({ status: 'DELIVERED', status_details: 'Left at front door', status_date: '2026-09-21T15:00:00Z' })), { now: NOW });
    expect(r).toMatchObject({ state: 'delivered', deliveredDate: '2026-09-21' });
  });

  it('does not take "will be delivered" in transit words as a delivery', () => {
    const r = readDelivery(readShippoTrack(track({ status: 'TRANSIT', status_details: 'Your package will be delivered Tuesday', status_date: '2026-09-22T10:00:00Z' })), { now: NOW });
    expect(r.state).toBe('moving');
  });

  it('reads a return and a waiting-for-pickup parcel', () => {
    expect(readDelivery(readShippoTrack(track({ status: 'RETURNED', status_date: '2026-09-22' })), { now: NOW }).state).toBe('returning');
    expect(readDelivery(readShippoTrack(track({ status: 'FAILURE', substatus: { code: 'pickup_available' }, status_date: '2026-09-22', location: { city: 'Buffalo', state: 'NY' } })), { now: NOW }))
      .toMatchObject({ state: 'pickup', place: 'Buffalo, NY' });
  });

  it('flags a parcel with no scan for a week, and ignores an unknown answer', () => {
    expect(readDelivery(readShippoTrack(track({ status: 'TRANSIT', status_date: '2026-09-10T10:00:00Z' })), { now: NOW }).state).toBe('stuck');
    expect(readDelivery(readShippoTrack(track({ status: 'UNKNOWN' })), { now: NOW })).toBeNull();
    expect(readDelivery(readShippoTrack({}), { now: NOW })).toBeNull();
  });
});

describe('imported Shippo labels remember their carrier', () => {
  it('keeps the provider of an expanded rate as the carrier token', () => {
    const out = enrichShippoExpense({ date: '2026-09-18' }, { object_id: 't1', tracking_number: '9400', rate: { provider: 'USPS' } });
    expect(out.shippoCarrier).toBe('usps');
    expect(enrichShippoExpense({ date: '2026-09-18' }, { object_id: 't2', rate: 'rate_abc' }).shippoCarrier).toBeUndefined();
  });
});

describe('the delivery watch asks Shippo', () => {
  it('marks a UPS order delivered from Shippo’s tracking', async () => {
    const { loadApp, makeBook } = await import('./helpers/load-app.js');
    const { vi } = await import('vitest');
    const app = await loadApp({ books: [makeBook({ id: 'b' })] });
    const shipping = await import('../src/features/shipping.js');
    const today = new Date().toISOString().slice(0, 10);
    const order = { num: 'W-9', shipped: true, shippedDate: today, date: today, shipName: 'Sam', trackingNumber: '1Z999AA10123456784', shippoCarrier: 'ups' };
    app.main.states.b.hist = [order];
    app.main.TAX_CENTER.settings = { shippoKey: 'shippo_live_abc' };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      tracking_status: { status: 'DELIVERED', status_details: 'Delivered', status_date: `${today}T15:00:00Z` },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await shipping.followShippedParcels({ force: true });
      expect(result).toMatchObject({ asked: 1, answered: 1, news: 1 });
      expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.goshippo.com/tracks/ups/1Z999AA10123456784');
      expect(app.main.states.b.hist[0]).toMatchObject({ deliveryState: 'delivered', deliveredDate: today });
    } finally {
      vi.unstubAllGlobals();
    }
  }, 30000);
});
