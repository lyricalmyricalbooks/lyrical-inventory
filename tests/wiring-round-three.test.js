import { describe, it, expect } from 'vitest';
import { buildAttentionSignals } from '../src/lib/attention-signals.js';
import { buildActivityFeed } from '../src/lib/activity-feed.js';
import { newlyUrgent } from '../src/lib/notification-log.js';

const book = { id: 'hound', title: 'The Hound of Heaven', threshold: 0, currency: 'CAD' };

describe('the to-do list learns about part-paid invoices and device clashes', () => {
  const signals = (states, automation = {}) => buildAttentionSignals({
    books: [book], states, automation, today: '2026-09-23',
  }).signals;

  it('flags an invoice a store paid only part of by card', () => {
    const inv = { id: 'i1', num: 'INV-2026-7', storeName: 'Paper Moon', status: 'sent',
      stripePartPayments: [{ amountMinor: 4000, expectedMinor: 10000, currency: 'CAD', at: 1 }] };
    const s = signals({ hound: { stock: 50, invoices: [inv] } }).find(x => x.id.startsWith('money-invoice-short'));
    expect(s.label).toBe('Invoice INV-2026-7 was only partly paid');
    expect(s.detail).toContain('Paper Moon paid CAD 40.00 by card of CAD 100.00');
  });

  it('drops it once the invoice is paid in full', () => {
    const inv = { id: 'i1', num: 'INV-2026-7', status: 'paid', stripePartPayments: [{ amountMinor: 4000 }] };
    expect(signals({ hound: { stock: 50, invoices: [inv] } }).some(x => x.id.startsWith('money-invoice-short'))).toBe(false);
  });

  it('asks for a look at changes made on two devices at once', () => {
    const s = signals({ hound: { stock: 50 } }, { syncConflicts: 2 }).find(x => x.id === 'setup-sync-conflicts');
    expect(s.label).toBe('2 changes were made on two devices at once');
    expect(s.fix).toMatchObject({ kind: 'action', tab: 'sync-conflicts' });
  });
});

describe('what has been happening includes invoices, reminders, labels and receipts', () => {
  const feed = (state, businessExpenses) =>
    buildActivityFeed([book], { hound: state }, { limit: 0, businessExpenses });

  it('shows a paid invoice, marked automatic when a card settled it', () => {
    const ev = feed({ invoices: [{ id: 'i1', num: 'INV-1', storeName: 'Paper Moon', total: 100, date: '2026-09-01', status: 'paid', paidAt: Date.parse('2026-09-10T10:00:00'), stripeChargeId: 'ch_1' }] })
      .find(e => e.kind === 'invoice-paid');
    expect(ev.text).toBe('Paper Moon paid invoice INV-1 by card');
    expect(ev.auto).toBe(true);
  });

  it('shows reminders that went out, and skips failed ones', () => {
    const texts = feed({ invoices: [{ id: 'i1', num: 'INV-1', storeName: 'Paper Moon', total: 100, date: '2026-09-01',
      reminders: [{ at: Date.parse('2026-09-15T09:00:00'), status: 'sent', kind: 'auto' }, { at: 2, status: 'failed' }] }] })
      .filter(e => e.kind === 'invoice-reminder');
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ text: 'Payment reminder emailed to Paper Moon for invoice INV-1', auto: true });
  });

  it('shows shipping labels and filed receipts from the business ledger', () => {
    const events = feed({}, [
      { id: 1, ref: 'shippo:abc', desc: 'Canada Post Expedited', amount: 18.4, currency: 'CAD', date: '2026-09-12', shippingOrderNumber: '#AB-1' },
      { id: 2, ref: 'receipt-email:x', importedFromEmail: true, vendor: 'Staples', cat: 'Office Supplies', amount: 42.1, currency: 'CAD', date: '2026-09-13' },
      { id: 3, ref: 'manual', desc: 'Lunch', amount: 12, date: '2026-09-13' },
    ]);
    expect(events.map(e => e.text)).toEqual(expect.arrayContaining([
      'Shipping label for #AB-1 — Canada Post Expedited',
      'Receipt filed — Staples (Office Supplies)',
    ]));
    expect(events.some(e => e.text.includes('Lunch'))).toBe(false);
  });
});

describe('newly urgent to-do items reach the notification history once', () => {
  const sig = (id, status = 'warn') => ({ id, status, label: id });

  it('announces nothing the first time, only remembers', () => {
    expect(newlyUrgent([sig('a')], null)).toEqual({ fresh: [], remember: ['a'] });
  });

  it('announces an urgent item it has not seen, and not one it has', () => {
    const { fresh } = newlyUrgent([sig('a'), sig('b')], ['a']);
    expect(fresh.map(s => s.id)).toEqual(['b']);
  });

  it('ignores items that are only to-dos, not urgent', () => {
    expect(newlyUrgent([sig('c', 'info')], []).fresh).toEqual([]);
  });

  it('announces an item again after it cleared and came back', () => {
    const cleared = newlyUrgent([], ['a']).remember;
    expect(newlyUrgent([sig('a')], cleared).fresh.map(s => s.id)).toEqual(['a']);
  });
});
