import { describe, it, expect } from 'vitest';
import {
  isBatchCandidate, scaledParcel, pickCheapestRate, preflightBlocker, addressVerdictBlocker,
  isCosmeticCorrection, originBlocker, describeBatchTotal, batchCustomsDeclaration,
} from '../src/lib/batch-shipping.js';

const now = new Date('2026-09-24T12:00:00Z');
const order = (over = {}) => ({ num: 'LMB-1001', shipName: 'Ada', shipAddr1: '1 Main St', date: '2026-09-20', ...over });
const address = { street1: '1 Main St', city: 'Toronto', zip: 'M4B 1B3', country: 'CA' };
const plan = { presetBookId: 'hound', autoSafe: true, confidence: 'exact', totalQty: 1, customsUnitValue: 25 };

describe('isBatchCandidate', () => {
  it('takes a recent unshipped order with an address', () => {
    expect(isBatchCandidate(order(), now)).toBe(true);
  });
  it('skips shipped, voided, tracked, old, addressless or numberless orders', () => {
    expect(isBatchCandidate(order({ shipped: true }), now)).toBe(false);
    expect(isBatchCandidate(order({ voided: true }), now)).toBe(false);
    expect(isBatchCandidate(order({ trackingNumber: 'X' }), now)).toBe(false);
    expect(isBatchCandidate(order({ date: '2026-01-01' }), now)).toBe(false);
    expect(isBatchCandidate(order({ shipAddr1: '' }), now)).toBe(false);
    expect(isBatchCandidate(order({ num: '' }), now)).toBe(false);
  });
});

describe('scaledParcel', () => {
  it('stacks height and weight per copy', () => {
    const p = scaledParcel({ length: 10, width: 8, height: 0.8, dim_unit: 'in', weight: 1.1, weight_unit: 'lb' }, 3);
    expect(p).toMatchObject({ length: 10, width: 8, height: 2.4, weight: 3.3, distance_unit: 'in', mass_unit: 'lb' });
  });
});

describe('pickCheapestRate', () => {
  it('picks the lowest price, faster on a tie, and ignores junk', () => {
    const rates = [
      { object_id: 'a', amount: '12.00', estimated_days: 2 },
      { object_id: 'b', amount: '9.50', estimated_days: 6 },
      { object_id: 'c', amount: '9.50', estimated_days: 3 },
      { object_id: 'd', amount: '0' },
      { amount: '1.00' },
    ];
    expect(pickCheapestRate(rates).object_id).toBe('c');
    expect(pickCheapestRate([])).toBeNull();
  });
});

describe('preflightBlocker', () => {
  it('passes a clean domestic order', () => {
    expect(preflightBlocker({ address, plan })).toBe('');
  });
  it('holds orders that already have a label', () => {
    expect(preflightBlocker({ address, plan, existing: { tracking: 'T1', labels: [] } })).toMatch(/T1/);
  });
  it('holds unsure or mixed boxes', () => {
    expect(preflightBlocker({ address, plan: { ...plan, autoSafe: false, confidence: 'mixed' } })).toMatch(/weight/);
    expect(preflightBlocker({ address, plan: null })).toMatch(/box size/);
  });
  it('needs a phone for international parcels', () => {
    const us = { ...address, country: 'US' };
    expect(preflightBlocker({ address: us, plan })).toMatch(/phone/);
    expect(preflightBlocker({ address: us, plan, phone: '5551234567' })).toBe('');
  });
});

describe('addressVerdictBlocker', () => {
  it('accepts a valid address', () => {
    expect(addressVerdictBlocker({ status: 'valid', corrections: [] })).toBe('');
  });
  it('accepts cosmetic-only corrections', () => {
    const corrections = [
      { field: 'street1', label: 'Street', from: '1 Main Street', to: '1 MAIN ST' },
      { field: 'zip', label: 'ZIP', from: '10001', to: '10001-1234' },
    ];
    expect(addressVerdictBlocker({ status: 'partially_valid', corrections })).toBe('');
  });
  it('holds real corrections, invalid and unconfirmed addresses', () => {
    expect(addressVerdictBlocker({ status: 'partially_valid', corrections: [{ field: 'city', label: 'City', from: 'Toronot', to: 'Toronto' }] })).toMatch(/city/);
    expect(addressVerdictBlocker({ status: 'invalid', corrections: [] })).toMatch(/doesn’t exist/);
    expect(addressVerdictBlocker({ status: 'unverified', corrections: [] })).toMatch(/confirm/);
    expect(addressVerdictBlocker(null)).toMatch(/check/);
  });
  it('treats a different house number as real', () => {
    expect(isCosmeticCorrection({ field: 'street1', from: '12 Main St', to: '21 Main St' })).toBe(false);
  });
});

describe('the rest', () => {
  it('names missing return-address fields', () => {
    expect(originBlocker({ name: 'Me', street1: '1 St', city: 'T', zip: 'M' })).toBe('');
    expect(originBlocker({ name: 'Me' })).toMatch(/street, city, postal code/);
  });
  it('totals per currency', () => {
    expect(describeBatchTotal([{ rate: { amount: '10.10', currency: 'CAD' } }, { rate: { amount: '2', currency: 'CAD' } }])).toBe('$12.10 CAD');
  });
  it('declares US parcels DDP with per-copy weight', () => {
    const decl = batchCustomsDeclaration({ signer: 'Me', destCountry: 'US', parcel: { weight: 2.2, mass_unit: 'lb' }, qty: 2, unitValue: 25 });
    expect(decl.incoterm).toBe('DDP');
    expect(decl.items[0]).toMatchObject({ quantity: 2, net_weight: '1.10', value_amount: '50.00' });
  });
});
