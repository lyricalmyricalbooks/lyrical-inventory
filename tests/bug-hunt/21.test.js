import { test, expect } from 'vitest';
import { buildActivityFeed } from '../../src/lib/activity-feed.js';
// A late-evening event belongs to the day it happened where the shop is, not the UTC day.
test('evening payout request stays on its local day', () => {
  const late = new Date(2026, 10, 25, 23, 30); // 11:30 PM local time
  const book = { id: 'b1', title: 'T' };
  const feed = buildActivityFeed([book], { b1: { payoutRequests: [{ id: 1, amount: 10, requestedAt: late.toISOString() }] } });
  expect(feed[0].date).toBe('2026-11-25');
});
