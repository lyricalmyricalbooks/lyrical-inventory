import { describe, it, expect } from 'vitest';
import {
  bigCartelOrderShipments,
  bigCartelTrackingByOrder,
  trackingToStamp,
  shipmentDate,
} from '../src/lib/bigcartel-tracking.js';
import { normalizeShippingOrderNumber as norm } from '../src/lib/shipping-reconciliation.js';

const PIN = '7023 2104 5566 7788';

describe('Big Cartel tracking numbers', () => {
  it('reads shipments referenced through included', () => {
    const order = { id: 'JIPY-765908', relationships: { shipments: { data: [{ type: 'shipments', id: '9' }] } } };
    const included = [{ type: 'shipments', id: '9', attributes: { carrier: 'canada_post', tracking_number: PIN, created_at: '2026-09-02T10:00:00Z' } }];
    const ships = bigCartelOrderShipments(order, included);
    expect(ships).toEqual([{ tracking: '7023210455667788', carrier: 'canada_post', trackingUrl: '', shippedAt: '2026-09-02T10:00:00Z' }]);
  });

  it('reads shipments inline on the order and ignores ones without a number', () => {
    const order = { id: 'A-1', attributes: { shipments: [{ tracking_number: '' }, { tracking_number: 'LX123456789CA' }] } };
    expect(bigCartelOrderShipments(order).map(s => s.tracking)).toEqual(['LX123456789CA']);
  });

  it('maps each order to its latest shipment', () => {
    const orders = [
      { id: 'A-1', attributes: { shipments: [
        { tracking_number: 'OLD1', created_at: '2026-09-01' },
        { tracking_number: 'NEW1', created_at: '2026-09-05' },
      ] } },
      { id: 'A-2', attributes: {} },
    ];
    const map = bigCartelTrackingByOrder(orders);
    expect(map.get(norm('A-1')).tracking).toBe('NEW1');
    expect(map.has(norm('A-2'))).toBe(false);
  });

  it('only fills orders with no tracking number and skips voided rows', () => {
    const byOrder = new Map([[norm('A-1'), { tracking: 'T1' }], [norm('A-2'), { tracking: 'T2' }], [norm('A-3'), { tracking: 'T3' }]]);
    const rows = [
      { bookId: 'b', entry: { num: 'A-1' } },
      { bookId: 'b', entry: { num: 'A-2', trackingNumber: 'KEEP' } },
      { bookId: 'b', entry: { num: 'A-3', voided: true } },
    ];
    expect(trackingToStamp(rows, byOrder, norm).map(r => r.entry.num)).toEqual(['A-1']);
  });

  it('turns a shipment time into a ledger date', () => {
    expect(shipmentDate({ shippedAt: '2026-09-02T10:00:00Z' })).toBe('2026-09-02');
    expect(shipmentDate({ shippedAt: '' })).toBe('');
  });
});

describe('searching email for a specific tracking number', () => {
  it('searches each number, plus the spaced form of a Canada Post number', async () => {
    const { trackingEmailQuery } = await import('../src/lib/shipping-email.js');
    expect(trackingEmailQuery(['7023 2104 5566 7788', 'LX123456789CA'], { since: '2026-08-01' }))
      .toBe('{"7023210455667788" OR "7023 2104 5566 7788" OR "LX123456789CA"} after:2026/08/01');
    expect(trackingEmailQuery([])).toBe('');
  });
});
