// Following shipped parcels to the door: which to ask about, how to read the
// answer, and what to say. Pure rules from lib/delivery-watch.js.
import { describe, it, expect } from 'vitest';
import {
  DELIVERY_RECHECK_MS,
  describeDeliveryNews,
  isDeliveryNews,
  readDelivery,
  shipmentsToFollow,
} from '../src/lib/delivery-watch.js';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const row = (entry, bookId = 'hound') => ({
  bookId,
  entry: { shipped: true, trackingNumber: '1234567890123456', shippedDate: '2026-09-18', ...entry },
});

describe('which parcels to ask about', () => {
  it('follows a recent Canada Post parcel that has not arrived', () => {
    const picked = shipmentsToFollow([row({})], { now: NOW });
    expect(picked).toHaveLength(1);
    expect(picked[0].pin).toBe('1234567890123456');
  });

  it('leaves alone what is delivered, voided, unshipped or on its way back', () => {
    expect(shipmentsToFollow([
      row({ deliveredDate: '2026-09-20' }),
      row({ voided: true }),
      row({ shipped: false }),
      row({ deliveryState: 'returning' }),
    ], { now: NOW })).toEqual([]);
  });

  it('ignores another carrier’s tracking number', () => {
    expect(shipmentsToFollow([row({ trackingNumber: '1Z999AA10123456784' })], { now: NOW })).toEqual([]);
  });

  it('stops following a parcel after about six weeks', () => {
    expect(shipmentsToFollow([row({ shippedDate: '2026-07-01' })], { now: NOW })).toEqual([]);
  });

  it('does not ask about the same parcel again within half a day', () => {
    const recent = new Date(NOW - DELIVERY_RECHECK_MS / 2).toISOString();
    expect(shipmentsToFollow([row({ deliveryCheckedAt: recent })], { now: NOW })).toEqual([]);
  });

  it('asks about the parcel checked longest ago first, and only a batch at a time', () => {
    const rows = [
      row({ trackingNumber: '1111111111111', deliveryCheckedAt: '2026-09-22T00:00:00Z' }),
      row({ trackingNumber: '2222222222222' }),
      row({ trackingNumber: '3333333333333', deliveryCheckedAt: '2026-09-21T00:00:00Z' }),
    ];
    const picked = shipmentsToFollow(rows, { now: NOW, batch: 2 });
    expect(picked.map(p => p.pin)).toEqual(['2222222222222', '3333333333333']);
  });

  it('asks once about a parcel two orders share', () => {
    expect(shipmentsToFollow([row({}), row({}, 'other')], { now: NOW })).toHaveLength(1);
  });
});

describe('reading the answer', () => {
  const found = (extra) => ({ found: true, pin: '1', ...extra });

  it('knows a delivered parcel, and when', () => {
    expect(readDelivery(found({ status: 'Delivered', eventDateTime: '2026-09-21T14:00:00' }), { now: NOW }))
      .toMatchObject({ state: 'delivered', deliveredDate: '2026-09-21' });
    expect(readDelivery(found({ status: 'In transit', actualDeliveryDate: '2026-09-22' }), { now: NOW }).state)
      .toBe('delivered');
  });

  it('does not mistake "could not be delivered" for delivered', () => {
    expect(readDelivery(found({ status: 'Item could not be delivered', eventDateTime: '2026-09-22' }), { now: NOW }).state)
      .not.toBe('delivered');
  });

  it('spots a parcel waiting at a post office', () => {
    expect(readDelivery(found({ status: 'Notice card left indicating where the item can be picked up', eventDateTime: '2026-09-22' }), { now: NOW }).state)
      .toBe('pickup');
  });

  it('spots a parcel coming back', () => {
    expect(readDelivery(found({ status: 'Item being returned to sender', eventDateTime: '2026-09-22' }), { now: NOW }).state)
      .toBe('returning');
  });

  it('calls a parcel stuck after a week without a scan', () => {
    expect(readDelivery(found({ status: 'In transit', eventDateTime: '2026-09-10T08:00:00' }), { now: NOW }).state).toBe('stuck');
    expect(readDelivery(found({ status: 'In transit', eventDateTime: '2026-09-20T08:00:00' }), { now: NOW }).state).toBe('moving');
  });

  it('reads nothing into an empty answer', () => {
    expect(readDelivery(null, { now: NOW })).toBeNull();
    expect(readDelivery({ found: false }, { now: NOW })).toBeNull();
  });
});

describe('what is worth saying', () => {
  it('says each problem once, and never "still moving"', () => {
    expect(isDeliveryNews('', { state: 'pickup' })).toBe(true);
    expect(isDeliveryNews('pickup', { state: 'pickup' })).toBe(false);
    expect(isDeliveryNews('', { state: 'moving' })).toBe(false);
    expect(isDeliveryNews('stuck', { state: 'delivered' })).toBe(true);
  });

  it('leads with the parcel that needs a look', () => {
    const said = describeDeliveryNews([
      { state: 'delivered', customer: 'Sam' },
      { state: 'pickup', customer: 'Dana', place: 'Halifax' },
    ]);
    expect(said.needsYou).toBe(true);
    expect(said.title).toBe('A parcel needs a look');
    expect(said.detail).toContain('Dana\'s parcel is waiting at a post office (Halifax)');
    expect(said.detail).toContain('Sam has received their order.');
  });

  it('reports plain good news without asking for anything', () => {
    const said = describeDeliveryNews([{ state: 'delivered', customer: 'Sam' }, { state: 'delivered', num: '#AB-1' }]);
    expect(said).toMatchObject({ needsYou: false, title: '2 parcels delivered' });
  });

  it('says nothing for nothing', () => {
    expect(describeDeliveryNews([]).count).toBe(0);
  });
});
