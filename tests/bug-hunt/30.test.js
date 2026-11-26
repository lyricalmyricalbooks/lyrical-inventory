import { it, expect } from 'vitest';
import { unshipOrderForRefund } from '../../src/lib/carriers/label-refunds.js';
it('keeps replacement tracking when refunded label tracking is blank', () => {
  const o = { shipped: true, trackingNumber: 'NEW123' };
  expect(unshipOrderForRefund(o, '')).toBe(false);
  expect(o.trackingNumber).toBe('NEW123');
});
