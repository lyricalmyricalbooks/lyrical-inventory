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

describe('findExistingLabel — the website already shipped it', () => {
  const webOrder = (over = {}) => ({ num: '#LMB-1001', webOrderId: 'LMB-1001', ...over });

  it('warns when the tracking came from the website', () => {
    const found = findExistingLabel('LMB-1001', { hist: [webOrder({ trackingNumber: 'W1', webTracking: 'W1', shipped: true, webFulfillmentStatus: 'shipped' })] });
    expect(found).toMatchObject({ tracking: 'W1', fromWebsite: true });
    expect(describeExistingLabel(found)[0]).toEqual(['Website', 'Already shipped from the website (tracking W1). A new label makes a second parcel.']);
  });

  it('warns when the website marked it sent without tracking', () => {
    const found = findExistingLabel('LMB-1001', { hist: [webOrder({ webFulfillmentStatus: 'delivered' })] });
    expect(found).toMatchObject({ tracking: '', fromWebsite: true, labels: [] });
    expect(describeExistingLabel(found)[0][1]).toBe('Already shipped from the website. A new label makes a second parcel.');
  });

  it('a label bought here is not "from the website"', () => {
    const found = findExistingLabel('LMB-1001', { hist: [webOrder({ trackingNumber: 'APP1', webTracking: '' })] });
    expect(found).toMatchObject({ tracking: 'APP1', fromWebsite: false });
  });

  it('a website order still being packed has no label to warn about', () => {
    expect(findExistingLabel('LMB-1001', { hist: [webOrder({ webFulfillmentStatus: 'paid' })] })).toBeNull();
  });

  it('reads the live row before a voided one with the same number', () => {
    const hist = [{ num: '#LMB-1001', voided: true, trackingNumber: 'OLD' }, webOrder({ trackingNumber: 'W1', webTracking: 'W1' })];
    expect(findExistingLabel('LMB-1001', { hist }).tracking).toBe('W1');
  });
});

describe('findExistingLabel — a website label not yet sent', () => {
  it('says the website has a label, not that it shipped', () => {
    const found = findExistingLabel('LMB-1001', { hist: [{ num: '#LMB-1001', webOrderId: 'LMB-1001', trackingNumber: 'W1', webTracking: 'W1', webFulfillmentStatus: 'processing' }] });
    expect(found).toMatchObject({ fromWebsite: true, websiteShipped: false });
    expect(describeExistingLabel(found)[0][1]).toBe('The website already has a label (tracking W1). A new label makes a second parcel.');
  });
});
