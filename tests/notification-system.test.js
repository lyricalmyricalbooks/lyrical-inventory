import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LOG_LIMIT,
  clearNotificationLog,
  logNotification,
  markNotificationsRead,
  notificationDayLabel,
  readNotificationLog,
  unreadNotificationCount,
} from '../src/lib/notification-log.js';
import { buildAttentionSignals } from '../src/lib/attention-signals.js';
import { buildActivityFeed } from '../src/lib/activity-feed.js';

describe('notification history', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('keeps each notification, newest first, unread', () => {
    logNotification({ id: 'delivery-watch', title: 'Parcel delivered' }, { now: 1000 });
    logNotification({ id: 'receipt-sweep', title: '2 new receipts' }, { now: 2000 });
    const log = readNotificationLog();
    expect(log.map(i => i.title)).toEqual(['2 new receipts', 'Parcel delivered']);
    expect(unreadNotificationCount()).toBe(2);
  });

  it('updates an unread message of the same kind instead of stacking it', () => {
    logNotification({ id: 'new-orders', title: '2 new orders' }, { now: 1000 });
    logNotification({ id: 'new-orders', title: '3 new orders' }, { now: 5000 });
    expect(readNotificationLog().map(i => i.title)).toEqual(['3 new orders']);
  });

  it('adds a fresh line once the earlier one was read', () => {
    logNotification({ id: 'new-orders', title: '2 new orders' }, { now: 1000 });
    markNotificationsRead();
    logNotification({ id: 'new-orders', title: '1 new order' }, { now: 5000 });
    expect(readNotificationLog().map(i => [i.title, i.read])).toEqual([['1 new order', false], ['2 new orders', true]]);
  });

  it('does not repeat the exact same words it already showed', () => {
    logNotification({ id: 'x', title: 'Same', detail: 'same' }, { now: 1000 });
    markNotificationsRead();
    logNotification({ id: 'x', title: 'Same', detail: 'same' }, { now: 2000 });
    expect(readNotificationLog()).toHaveLength(1);
  });

  it('is capped, and can be cleared', () => {
    for (let i = 0; i < LOG_LIMIT + 20; i++) logNotification({ id: `k${i}`, title: `t${i}` }, { now: i });
    expect(readNotificationLog()).toHaveLength(LOG_LIMIT);
    clearNotificationLog();
    expect(readNotificationLog()).toEqual([]);
  });

  it('survives storage that is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => logNotification({ id: 'x', title: 'y' })).not.toThrow();
    expect(readNotificationLog()).toEqual([]);
  });

  it('labels days plainly', () => {
    const now = Date.parse('2026-09-23T15:00:00');
    expect(notificationDayLabel(now - 3600000, now)).toBe('Today');
    expect(notificationDayLabel(now - 86400000, now)).toBe('Yesterday');
  });
});

describe('the to-do list knows what the automations left', () => {
  const book = { id: 'hound', title: 'The Hound of Heaven', threshold: 0 };
  const run = (automation, hist = []) => buildAttentionSignals({
    books: [book], states: { hound: { stock: 50, hist } }, automation, today: '2026-09-23',
  }).byGroup.orders;

  it('lists orders, card payments, refunds, receipts and labels waiting for the owner', () => {
    const ids = run({
      websiteOrdersToReview: 2, cardPaymentsToMatch: 1, refundsToReverse: 1, storeReversals: 1,
      receiptsWaiting: 3, receiptsReady: 2, labelsToMatch: 4,
    }).map(s => s.id);
    expect(ids).toEqual(expect.arrayContaining([
      'orders-review', 'orders-card-match', 'orders-reverse', 'orders-receipts', 'orders-labels',
    ]));
  });

  it('reads unsent orders and problem parcels straight from the ledger', () => {
    const hist = [
      { chan: 'Website', num: '#AB-1', date: '2026-09-15', shipName: 'Dana', shipAddr1: '1 Main' },
      { chan: 'Website', num: '#AB-2', date: '2026-09-10', shipped: true, deliveryState: 'pickup', shipName: 'Sam' },
      { chan: 'Website', num: '#AB-3', date: '2026-09-10', shipped: true, deliveryState: 'pickup', deliveredDate: '2026-09-20' },
    ];
    const signals = run({}, hist);
    const unsent = signals.find(s => s.id === 'orders-unshipped');
    expect(unsent.label).toBe('1 paid order hasn’t been sent');
    expect(unsent.detail).toContain('Dana (#AB-1), waiting 8 days');
    const pickup = signals.find(s => s.id === 'parcels-pickup');
    expect(pickup.label).toBe('1 parcel is waiting at a post office');
  });

  it('does not count an order that has a label matched to it', () => {
    const hist = [{ chan: 'Website', num: '#AB-1', date: '2026-09-15', shipAddr1: '1 Main' }];
    expect(run({ labelledOrderNums: ['#AB-1'] }, hist).some(s => s.id === 'orders-unshipped')).toBe(false);
  });

  it('is empty when nothing is waiting', () => {
    expect(run({})).toEqual([]);
  });

  it('points each fix at a fixed, named destination — never code', () => {
    run({ receiptsWaiting: 1, labelsToMatch: 1, refundsToReverse: 1 }).forEach(signal => {
      expect(['tab', 'action']).toContain(signal.fix.kind);
      expect(signal.fix.tab).toMatch(/^[a-z-]+$/);
    });
  });
});

describe('what has been happening includes what the app did on its own', () => {
  const book = { id: 'hound', title: 'The Hound of Heaven', currency: 'CAD' };
  const feed = (hist) => buildActivityFeed([book], { hound: { hist } }, { limit: 0 });

  it('says when a sale was recorded for you, and via the card reader', () => {
    const [ev] = feed([{ chan: 'Book Fair', qty: 1, price: 30, date: '2026-09-20', notes: 'Card reader', autoRecorded: true }]);
    expect(ev.text).toBe('Recorded for you — The Hound of Heaven via the card reader');
  });

  it('follows the parcel: sent, then delivered', () => {
    const texts = feed([{
      chan: 'Website', num: '#AB-1', qty: 1, price: 30, date: '2026-09-10', shipName: 'Dana',
      shipped: true, shippedDate: '2026-09-11', trackingNumber: '1', deliveredDate: '2026-09-14',
    }]).map(e => e.text);
    expect(texts).toEqual(expect.arrayContaining([
      'Sent Dana’s order (#AB-1) — tracking added',
      'Delivered to Dana (#AB-1)',
    ]));
  });

  it('shows a reversed sale, with the reason', () => {
    const [ev] = feed([{ chan: 'Website', num: '#AB-1', qty: 2, price: 30, date: '2026-09-10', voided: true, voidedAt: Date.parse('2026-09-12T10:00:00'), voidedReason: 'Refunded in Stripe' }]);
    expect(ev.kind).toBe('reversal');
    expect(ev.text).toBe('Sale reversed — 2× The Hound of Heaven (#AB-1) · Refunded in Stripe');
  });

  it('leaves out a voided row with no record of when or why', () => {
    expect(feed([{ chan: 'Website', qty: 1, price: 30, date: '2026-09-10', voided: true }])).toEqual([]);
  });
});

describe('one-tap actions on to-do items', () => {
  const book = { id: 'hound', title: 'The Hound of Heaven', threshold: 0 };
  const run = (automation, hist = []) => buildAttentionSignals({
    books: [book], states: { hound: { stock: 50, hist } }, automation, today: '2026-09-23',
  }).byGroup.orders;

  it('gives each unsent order its own "Mark as sent" button', () => {
    const hist = [
      { chan: 'Website', num: '#AB-1', date: '2026-09-15', shipName: 'Dana', shipAddr1: '1 Main' },
      { chan: 'Website', num: '#AB-2', date: '2026-09-18', shipName: 'Sam', shipAddr1: '2 Main' },
    ];
    const signal = run({}, hist).find(s => s.id === 'orders-unshipped');
    expect(signal.items.map(i => i.label)).toEqual(['Dana · #AB-1 · 8 days', 'Sam · #AB-2 · 5 days']);
    expect(signal.items[0].quick).toEqual({ label: 'Mark as sent', kind: 'action', tab: 'mark-shipped', bookId: 'hound', num: '#AB-1' });
  });

  it('offers to file the ready receipts, and to reverse refunded sales, in one tap', () => {
    const signals = run({ receiptsWaiting: 3, receiptsReady: 2, refundsToReverse: 1 });
    expect(signals.find(s => s.id === 'orders-receipts').quick).toMatchObject({ label: 'File 2 now', tab: 'file-ready-receipts' });
    expect(signals.find(s => s.id === 'orders-reverse').quick).toMatchObject({ label: 'Reverse now', tab: 'reverse-sales' });
  });

  it('offers no filing button when nothing is ready', () => {
    expect(run({ receiptsWaiting: 3, receiptsReady: 0 }).find(s => s.id === 'orders-receipts').quick).toBeNull();
  });
});

describe('what the app did on its own is marked automatic', () => {
  const book = { id: 'hound', title: 'The Hound of Heaven', currency: 'CAD' };
  const feed = (hist) => buildActivityFeed([book], { hound: { hist } }, { limit: 0 });

  it('marks sales it recorded and parcels it saw delivered, and nothing else', () => {
    const events = feed([
      { chan: 'Website', num: '#AB-1', qty: 1, price: 30, date: '2026-09-10', autoRecorded: true, shipped: true, shippedDate: '2026-09-11', deliveredDate: '2026-09-14' },
      { chan: 'Direct', qty: 1, price: 30, date: '2026-09-12' },
    ]);
    const byKind = Object.fromEntries(events.map(e => [e.kind, e.auto]));
    expect(byKind).toMatchObject({ 'sale-auto': true, delivered: true, shipped: false, sale: false });
  });
});
