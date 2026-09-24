import { describe, it, expect } from 'vitest';
import { findExistingLabel, describeExistingLabel } from '../src/lib/label-duplicate-guard.js';

const postage = (over = {}) => ({
  cat: 'Shipping & Postage', desc: 'Shippo shipping label #123 — Canada Post Expedited',
  amount: 14.5, currency: 'CAD', date: '2026-09-20',
  shippingMatchStatus: 'matched', shippingOrderNumber: 'LMB-1001', ...over,
});

describe('findExistingLabel', () => {
  it('returns null for an order with no label', () => {
    expect(findExistingLabel('LMB-1001', { hist: [{ num: 'LMB-1001' }], expenses: [] })).toBeNull();
    expect(findExistingLabel('', { hist: [], expenses: [postage()] })).toBeNull();
  });

  it('finds a tracking number on the order', () => {
    const found = findExistingLabel('#lmb-1001', { hist: [{ num: 'LMB-1001', trackingNumber: 'ABC', shippedDate: '2026-09-20' }] });
    expect(found.tracking).toBe('ABC');
    expect(describeExistingLabel(found)).toContainEqual(['Tracking', 'ABC']);
  });

  it('finds postage linked to the order in the ledger', () => {
    const found = findExistingLabel('LMB-1001', { hist: [], expenses: [postage(), postage({ shippingOrderNumber: 'LMB-1002' })] });
    expect(found.labels).toHaveLength(1);
    expect(describeExistingLabel(found)[0][1]).toContain('14.50 CAD');
  });

  it('ignores unlinked, simulated and non-postage lines', () => {
    const expenses = [
      postage({ shippingMatchStatus: 'suggested' }),
      postage({ simulated: true }),
      postage({ cat: 'Supplies' }),
    ];
    expect(findExistingLabel('LMB-1001', { hist: [], expenses })).toBeNull();
  });
});
