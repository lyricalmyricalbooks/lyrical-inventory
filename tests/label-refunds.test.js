import { describe, it, expect } from 'vitest';
import {
  refundCarrier, refundState, canRequestRefund, shippoTransactionId, refundCredit,
  unshipOrderForRefund, describeRefundRefusal,
} from '../src/lib/label-refunds.js';
import { findExistingLabel } from '../src/lib/label-duplicate-guard.js';

const label = (over = {}) => ({
  id: 1, ref: 'shippo:tx123', cat: 'Shipping & Postage', desc: 'Shippo shipping label #T1',
  amount: 12.5, currency: 'CAD', origAmount: 12.5, baseAmount: 12.5, fxRate: 1, date: '2026-09-20',
  shippingMatchStatus: 'matched', shippingOrderNumber: '#LMB-1001', ...over,
});

describe('refund state', () => {
  it('knows the carrier and transaction', () => {
    expect(refundCarrier(label())).toBe('shippo');
    expect(refundCarrier(label({ ref: 'canadapost:123' }))).toBe('canadapost');
    expect(refundCarrier(label({ ref: 'receipt:1' }))).toBe('');
    expect(shippoTransactionId(label())).toBe('tx123');
  });
  it('moves from none to requested to refunded', () => {
    const l = label();
    expect(refundState(l, [l])).toBe('none');
    expect(canRequestRefund(l, [l])).toBe(true);
    l.refundRequest = { status: 'QUEUED' };
    expect(refundState(l, [l])).toBe('requested');
    expect(canRequestRefund(l, [l])).toBe(false);
    expect(refundState(l, [l, { refundOf: 'shippo:tx123' }])).toBe('refunded');
  });
  it('never offers refunds on test labels or credits', () => {
    expect(canRequestRefund(label({ simulated: true }), [])).toBe(false);
    expect(canRequestRefund(label({ amount: -12.5 }), [])).toBe(false);
  });
});

describe('refundCredit', () => {
  it('cancels the cost exactly and stays on the same order', () => {
    const credit = refundCredit(label(), { refundId: 'rf1', date: '2026-09-24' }, 7);
    expect(credit).toMatchObject({
      id: 7, amount: -12.5, baseAmount: -12.5, ref: 'shippo-refund:rf1', refundOf: 'shippo:tx123',
      shippingOrderNumber: '#LMB-1001', shippingMatchStatus: 'matched',
    });
  });
  it('uses the given prefix for Canada Post', () => {
    expect(refundCredit(label({ ref: 'canadapost:9' }), { refundId: 'm', prefix: 'canadapost-refund' }).ref).toBe('canadapost-refund:m');
  });
});

describe('unshipOrderForRefund', () => {
  it('puts the order back to unshipped', () => {
    const order = { shipped: true, shippedDate: '2026-09-20', trackingNumber: 'T1' };
    expect(unshipOrderForRefund(order, 't 1')).toBe(true);
    expect(order).toMatchObject({ shipped: false, trackingNumber: '' });
    expect(order.shippedDate).toBeUndefined();
  });
  it('leaves an order alone when it already carries a different label', () => {
    const order = { shipped: true, trackingNumber: 'NEW' };
    expect(unshipOrderForRefund(order, 'OLD')).toBe(false);
    expect(order.shipped).toBe(true);
  });
});

describe('refunded labels and the duplicate warning', () => {
  it('no longer counts a refunded label as the order’s label', () => {
    const l = label({ refundRequest: { status: 'QUEUED' } });
    expect(findExistingLabel('LMB-1001', { hist: [], expenses: [l] })).toBeNull();
    expect(findExistingLabel('LMB-1001', { hist: [], expenses: [label()] })).not.toBeNull();
  });
});

describe('describeRefundRefusal', () => {
  it('explains the common refusals plainly', () => {
    expect(describeRefundRefusal(400, 'Label has already been used')).toMatch(/scanned/);
    expect(describeRefundRefusal(401, '')).toMatch(/API key/);
    expect(describeRefundRefusal(500, 'boom')).toMatch(/500/);
  });
});
