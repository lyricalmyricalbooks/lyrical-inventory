import { describe, it, expect } from 'vitest';
import { shippedOrderNumbers, findOrderInAnyBook, ordersStillToShip, nextOrderToShip, bigCartelShipQueue, waitingPhrase } from '../src/lib/ship-queue.js';
import { normalizeShippingOrderNumber as norm } from '../src/lib/shipping-reconciliation.js';

describe('ship queue', () => {
  it('counts shipped or tracked orders as sent, but not test runs or voids', () => {
    const rows = [
      { entry: { num: 'BC-101', shipped: true } },
      { entry: { num: 'BC-102', trackingNumber: 'X' } },
      { entry: { num: 'BC-103', shipped: true, trackingSimulated: true } },
      { entry: { num: 'BC-104', shipped: true, voided: true } },
      { entry: { num: 'BC-105' } },
    ];
    expect([...shippedOrderNumbers(rows, norm)].sort()).toEqual([norm('BC-101'), norm('BC-102')].sort());
  });

  it('finds an order in a book other than the first', () => {
    const states = { a: { hist: [{ num: 'BC-1' }] }, b: { hist: [{ num: '#bc-2' }] } };
    expect(findOrderInAnyBook(states, 'BC-2', norm)).toEqual({ bookId: 'b', entry: states.b.hist[0] });
    expect(findOrderInAnyBook(states, '', norm)).toBeNull();
    expect(findOrderInAnyBook(states, 'BC-9', norm)).toBeNull();
  });

  it('keeps only unsent orders, once each, skipping store addresses', () => {
    const items = [
      { orderNumber: 'BC-1' }, { orderNumber: '' }, { orderNumber: 'BC-2' }, { orderNumber: '#bc-2' }, { orderNumber: 'BC-3' },
    ];
    const left = ordersStillToShip(items, new Set([norm('BC-3')]), norm);
    expect(left.map(i => i.orderNumber)).toEqual(['BC-1', 'BC-2']);
  });

  it('picks the next unsent order that is not the one just labelled', () => {
    const items = [{ orderNumber: 'BC-1' }, { orderNumber: 'BC-2' }];
    expect(nextOrderToShip(items, new Set(), 'BC-1', norm).orderNumber).toBe('BC-2');
    expect(nextOrderToShip(items, new Set([norm('BC-2')]), 'BC-1', norm)).toBeNull();
  });
});

describe('big cartel ship queue', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  const o = (id, attrs = {}) => ({ id, attributes: { status: 'completed', created_at: '2026-09-20T12:00:00Z', ...attrs } });

  it('lists waiting orders oldest first with days waiting', () => {
    const q = bigCartelShipQueue([o('BC-2'), o('BC-1', { created_at: '2026-09-18T12:00:00Z' })], { normalize: norm, now });
    expect(q.map(x => x.orderNumber)).toEqual([norm('BC-1'), norm('BC-2')]);
    expect(q[0].daysWaiting).toBe(6);
  });

  it('leaves out shipped, pick-up, cancelled, pending, reversed and stale orders', () => {
    const orders = [
      o('BC-1', { shipping_status: 'shipped' }),
      o('BC-2'),
      o('BC-3'),
      o('BC-4', { status: 'pending' }),
      o('BC-5'),
      o('BC-6', { created_at: '2026-06-01T00:00:00Z' }),
      o('BC-7'),
    ];
    const q = bigCartelShipQueue(orders, {
      normalize: norm, now,
      shipped: new Set([norm('BC-2')]),
      pickups: new Set([norm('BC-3')]),
      reversed: ord => ord.id === 'BC-5',
    });
    expect(q.map(x => x.orderNumber)).toEqual([norm('BC-7')]);
  });

  it('describes the wait in plain words', () => {
    expect(waitingPhrase(0)).toBe('today');
    expect(waitingPhrase(1)).toBe('1 day');
    expect(waitingPhrase(4)).toBe('4 days');
    expect(waitingPhrase(null)).toBe('');
  });
});
