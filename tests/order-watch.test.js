import { describe, expect, it } from 'vitest';
import {
  describeNewOrders,
  dueForRefresh,
  isAnnounceableOrder,
  mergeSeenOrders,
  newOrdersSince,
  orderCustomerName,
  seedSeenOrders,
} from '../src/lib/order-watch.js';

const order = (id, attributes = {}) => ({
  id,
  attributes: { status: 'completed', created_at: '2026-09-05T10:00:00Z', total: '42.00', ...attributes },
});

describe('which orders are worth announcing', () => {
  it('says nothing at all on the very first look', () => {
    // Sixty historical orders are not sixty pieces of news.
    const orders = [order('AAAA-1'), order('BBBB-2'), order('CCCC-3')];
    expect(newOrdersSince(orders, [], { seeded: false })).toEqual([]);
  });

  it('announces only what was not there last time', () => {
    const orders = [order('AAAA-1'), order('BBBB-2')];
    const fresh = newOrdersSince(orders, ['#AAAA-1'], { seeded: true });
    expect(fresh.map(o => o.num)).toEqual(['#BBBB-2']);
  });

  it('matches a remembered number however it was written down', () => {
    const fresh = newOrdersSince([order('AAAA-1')], ['aaaa-1'], { seeded: true });
    expect(fresh).toEqual([]);
  });

  it('carries who bought and what it came to', () => {
    const orders = [order('BBBB-2', { customer_name: 'Dana Okafor', total: '58.50' })];
    expect(newOrdersSince(orders, [], { seeded: true })[0]).toMatchObject({
      num: '#BBBB-2',
      orderId: 'BBBB-2',
      date: '2026-09-05',
      customer: 'Dana Okafor',
      total: 58.5,
    });
  });

  it('stays quiet about an order the store says was cancelled', () => {
    const orders = [order('AAAA-1', { status: 'cancelled' }), order('BBBB-2', { status: 'abandoned' })];
    expect(newOrdersSince(orders, [], { seeded: true })).toEqual([]);
  });

  it('still announces a refunded order, because the sale did happen', () => {
    const fresh = newOrdersSince([order('AAAA-1', { status: 'refunded' })], [], { seeded: true });
    expect(fresh.map(o => o.num)).toEqual(['#AAAA-1']);
  });

  it('skips an order it could not identify, so it cannot repeat forever', () => {
    // No resolvable number means nothing to remember, which would announce it
    // again on every poll for the rest of the day.
    expect(newOrdersSince([{ id: '', attributes: { status: 'completed' } }], [], { seeded: true })).toEqual([]);
  });

  it('announces a duplicated order only once', () => {
    const fresh = newOrdersSince([order('AAAA-1'), order('AAAA-1')], [], { seeded: true });
    expect(fresh).toHaveLength(1);
  });

  it('survives junk rather than throwing at the publisher', () => {
    expect(newOrdersSince(null, null, { seeded: true })).toEqual([]);
    expect(newOrdersSince([null, undefined], [], { seeded: true })).toEqual([]);
  });

  it('grades cancelled statuses in either spelling', () => {
    expect(isAnnounceableOrder(order('A-1', { status: 'canceled' }))).toBe(false);
    expect(isAnnounceableOrder(order('A-1', { status: 'voided' }))).toBe(false);
    expect(isAnnounceableOrder(order('A-1'))).toBe(true);
  });
});

describe('remembering what has been announced', () => {
  it('seeds from a first batch without announcing it', () => {
    expect(seedSeenOrders([order('AAAA-1'), order('BBBB-2')])).toEqual(['#AAAA-1', '#BBBB-2']);
  });

  it('folds new numbers in without duplicating them', () => {
    expect(mergeSeenOrders(['#AAAA-1'], ['#BBBB-2', '#AAAA-1'])).toEqual(['#AAAA-1', '#BBBB-2']);
  });

  it('caps the list so browser storage cannot grow forever', () => {
    const many = Array.from({ length: 500 }, (_, i) => `#XXXX-${i}`);
    const merged = mergeSeenOrders(many, ['#YYYY-1']);
    expect(merged).toHaveLength(400);
    // The newest survive; the oldest are the ones dropped.
    expect(merged.at(-1)).toBe('#YYYY-1');
    expect(merged).not.toContain('#XXXX-0');
  });

  it('drops values that are not order numbers', () => {
    expect(mergeSeenOrders(['', null, 'nonsense'], ['#AAAA-1'])).toEqual(['#AAAA-1']);
  });
});

describe('when to ask the storefront again', () => {
  const base = {
    lastCheckedAt: 0, now: 60_000, intervalMs: 30_000,
    online: true, configured: true, visible: true, busy: false,
  };

  it('asks once the last answer has gone stale', () => {
    expect(dueForRefresh(base)).toBe(true);
  });

  it('leaves a fresh answer alone', () => {
    expect(dueForRefresh({ ...base, lastCheckedAt: 45_000 })).toBe(false);
  });

  it('does not spend mobile data while nobody is looking', () => {
    expect(dueForRefresh({ ...base, visible: false })).toBe(false);
  });

  it('does not try while the device is offline', () => {
    expect(dueForRefresh({ ...base, online: false })).toBe(false);
  });

  it('does not try when the storefront is not set up', () => {
    expect(dueForRefresh({ ...base, configured: false })).toBe(false);
  });

  it('does not stack a second request on one already running', () => {
    expect(dueForRefresh({ ...base, busy: true })).toBe(false);
  });

  it('never fires when no interval is configured', () => {
    expect(dueForRefresh({ ...base, intervalMs: 0 })).toBe(false);
    expect(dueForRefresh()).toBe(false);
  });
});

describe('what the notification says', () => {
  const dana = { num: '#AAAA-1', customer: 'Dana Okafor' };
  const sam = { num: '#BBBB-2', customer: 'Sam Reyes' };
  const kit = { num: '#CCCC-3', customer: 'Kit Lau' };

  it('names the buyer for a single order', () => {
    expect(describeNewOrders([dana])).toEqual({
      count: 1,
      title: 'New order',
      detail: 'Dana Okafor just ordered — #AAAA-1.',
    });
  });

  it('names both buyers for two', () => {
    const said = describeNewOrders([dana, sam]);
    expect(said.title).toBe('2 new orders');
    expect(said.detail).toBe('Dana Okafor and Sam Reyes ordered while you were away.');
  });

  it('names the first two and counts the rest', () => {
    const said = describeNewOrders([dana, sam, kit]);
    expect(said.title).toBe('3 new orders');
    expect(said.detail).toBe('Dana Okafor, Sam Reyes and 1 other ordered while you were away.');
  });

  it('says nothing when there is nothing to say', () => {
    expect(describeNewOrders([]).count).toBe(0);
    expect(describeNewOrders().title).toBe('');
  });
});

describe('reading the buyer name out of whatever the store sent', () => {
  it('prefers the plain name field', () => {
    expect(orderCustomerName(order('A-1', { customer_name: 'Dana Okafor' }))).toBe('Dana Okafor');
  });

  it('assembles first and last when that is all there is', () => {
    expect(orderCustomerName(order('A-1', { buyer_first_name: 'Dana', buyer_last_name: 'Okafor' })))
      .toBe('Dana Okafor');
  });

  it('falls back to the email address', () => {
    expect(orderCustomerName(order('A-1', { buyer_email: 'dana@example.com' }))).toBe('dana@example.com');
  });

  it('never renders an empty name into the notification', () => {
    expect(orderCustomerName(order('A-1'))).toBe('a customer');
    expect(orderCustomerName({})).toBe('a customer');
  });
});
