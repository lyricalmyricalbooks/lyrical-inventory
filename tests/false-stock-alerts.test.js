import { describe, it, expect, beforeEach } from 'vitest';
import { buildAttentionSignals } from '../src/lib/attention-signals.js';
import {
  logNotification,
  readNotificationLog,
  dropFalseStockNotifications,
  readSeenUrgent,
  writeSeenUrgent,
} from '../src/lib/notification-log.js';

const book = (id, extra = {}) => ({ id, title: id, maxPrint: 100, threshold: 10, listPrice: 30, ...extra });

describe('stock alerts wait for the books to load', () => {
  it('says nothing about stock for a book whose records have not arrived', () => {
    const result = buildAttentionSignals({ books: [book('hound'), book('photo')], states: {} });
    expect(result.signals.some(s => s.id.startsWith('stock-'))).toBe(false);
  });

  it('still flags a book that really is low once loaded', () => {
    const result = buildAttentionSignals({ books: [book('hound')], states: { hound: { stock: 3, hist: [] } } });
    expect(result.signals.map(s => s.id)).toContain('stock-low:hound');
  });
});

describe('clearing out the false alerts already in the history', () => {
  beforeEach(() => localStorage.clear());

  it('removes stock alerts that are not true now, once, and keeps everything else', () => {
    logNotification({ id: 'todo:stock-low:hound', title: 'Stock running low' });
    logNotification({ id: 'todo:stock-low:photo', title: 'Stock running low' });
    logNotification({ id: 'stripe-sales', title: '3 card sales recorded' });
    writeSeenUrgent(['stock-low:hound', 'stock-low:photo', 'money-overdue:x']);

    expect(dropFalseStockNotifications(['stock-low:photo'])).toBe(1);
    const kinds = readNotificationLog().map(i => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(['todo:stock-low:photo', 'stripe-sales']));
    expect(kinds).not.toContain('todo:stock-low:hound');
    expect(readSeenUrgent()).toEqual(['stock-low:photo', 'money-overdue:x']);

    // Runs only once per device.
    logNotification({ id: 'todo:stock-low:hound', title: 'Stock running low' });
    expect(dropFalseStockNotifications([])).toBe(0);
    expect(readNotificationLog().map(i => i.kind)).toContain('todo:stock-low:hound');
  });
});
