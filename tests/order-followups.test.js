import { describe, it, expect } from 'vitest';
import {
  describePostageReport,
  describeUnshipped,
  destinationLabel,
  postageReport,
  previousMonth,
  unshippedOrders,
} from '../src/lib/order-followups.js';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const order = (extra = {}) => ({
  bookId: 'hound',
  bookTitle: 'The Hound of Heaven',
  entry: { chan: 'Website', num: '#AB-1', date: '2026-09-18', shipName: 'Dana', shipAddr1: '1 Main St', qty: 1, ...extra },
});

describe('paid orders waiting to be sent', () => {
  it('finds an order paid days ago with nothing sent', () => {
    const [o] = unshippedOrders([order()], { now: NOW });
    expect(o).toMatchObject({ customer: 'Dana', num: '#AB-1', days: 5 });
  });

  it('leaves alone orders that went out, were voided, are too new, too old, or had no address', () => {
    expect(unshippedOrders([
      order({ shipped: true }),
      order({ trackingNumber: '123' }),
      order({ voided: true }),
      order({ date: '2026-09-22' }),
      order({ date: '2026-06-01' }),
      order({ shipAddr1: '', shipPostal: '', shipCity: '' }),
      order({ chan: 'Book Fair' }),
    ], { now: NOW })).toEqual([]);
  });

  it('counts an order with a matched label as sent', () => {
    expect(unshippedOrders([order()], { now: NOW, labelled: new Set(['#AB-1']) })).toEqual([]);
  });

  it('lists the longest-waiting first, and says how to stop the reminder', () => {
    const list = unshippedOrders([order({ num: '#AB-2', date: '2026-09-19' }), order()], { now: NOW });
    expect(list.map(o => o.num)).toEqual(['#AB-1', '#AB-2']);
    const said = describeUnshipped(list);
    expect(said.title).toBe('2 orders are waiting to be sent');
    expect(said.detail).toContain('Dana (#AB-1, 5 days)');
    expect(said.detail).toContain('mark it as shipped');
  });
});

describe('whether shipping paid for itself', () => {
  it('finds the month before', () => {
    expect(previousMonth('2026-09-23')).toBe('2026-08');
    expect(previousMonth('2026-01-05')).toBe('2025-12');
  });

  it('groups destinations the way shipping rates are set', () => {
    expect(destinationLabel({ shipCountry: 'Canada' })).toBe('Canada');
    expect(destinationLabel({})).toBe('Canada');
    expect(destinationLabel({ shipCountry: 'USA' })).toBe('United States');
    expect(destinationLabel({ shipCountry: 'Italy' })).toBe('Italy');
  });

  it('adds up a month and names where money was lost', () => {
    const report = postageReport([
      { date: '2026-08-02', destination: 'United States', paid: 10, postage: 18 },
      { date: '2026-08-10', destination: 'United States', paid: 10, postage: 16 },
      { date: '2026-08-12', destination: 'Canada', paid: 12, postage: 11 },
      { date: '2026-08-20', destination: 'Canada', paid: 12, postage: 12.3 },
      { date: '2026-07-30', destination: 'Canada', paid: 0, postage: 50 },
    ], '2026-08');
    expect(report).toMatchObject({ orders: 4, losing: 2 });
    expect(report.groups).toEqual([{ destination: 'United States', orders: 2, losing: 2, loss: 14 }]);
    const said = describePostageReport(report);
    expect(said.title).toBe('Shipping lost money on 2 orders in August');
    expect(said.detail).toContain('United States: 2 of 2 orders, $14.00 short');
    expect(said.detail).toContain('postage cost $13.30 more than customers paid');
  });

  it('stays quiet in a month where shipping paid for itself', () => {
    const report = postageReport([{ date: '2026-08-02', destination: 'Canada', paid: 15, postage: 12 }], '2026-08');
    expect(describePostageReport(report).count).toBe(0);
  });
});
