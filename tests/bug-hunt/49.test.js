import { test, expect, vi } from 'vitest';
import { dueForReminderTomorrow } from '../../src/lib/payment-reminders.js';
test('failed attempt 1h ago is chased tomorrow, so it is on the heads-up', () => {
  const now = Date.parse('2026-11-26T12:00:00Z'); vi.useFakeTimers(); vi.setSystemTime(now);
  const inv = { id:'a', status:'sent', dueDate:'2026-11-16', storeEmail:'s@x.com', total:100,
    reminders:[{ status:'failed', at: now - 3600000 }] };
  expect(dueForReminderTomorrow([inv], { today:'2026-11-26', days:7 }).map(i=>i.id)).toEqual(['a']);
});
