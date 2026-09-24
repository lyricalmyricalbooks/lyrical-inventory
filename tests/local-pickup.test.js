// Recognising orders the customer collected in person from the checkout's
// shipping option. Pure rules from lib/local-pickup.js.
import { describe, it, expect } from 'vitest';
import { looksLikeLocalPickup, withAutoLocalPickup } from '../src/lib/local-pickup.js';

describe('looksLikeLocalPickup', () => {
  it('recognises common pick-up option names', () => {
    for (const m of ['Local Pickup', 'Local pick-up', 'Pick up in Montreal', 'PICKUP', 'Collection in person']) {
      expect(looksLikeLocalPickup(m)).toBe(true);
    }
  });
  it('ignores ordinary shipping options and blanks', () => {
    for (const m of ['Canada Post Expedited', 'Free shipping', '', null, undefined, 'Pickering, ON']) {
      expect(looksLikeLocalPickup(m)).toBe(false);
    }
  });
});

describe('withAutoLocalPickup', () => {
  const pickup = { num: '1', shippingMethod: 'Local pickup' };
  it('marks a pick-up order as $0 postage', () => {
    expect(withAutoLocalPickup(pickup)).toMatchObject({ localPickup: true, autoLocalPickup: true, manualPostagePaid: true, postagePaid: 0 });
    expect(pickup.localPickup).toBeUndefined();
  });
  it('leaves it alone when the owner said no, set postage, or a label is linked', () => {
    expect(withAutoLocalPickup({ ...pickup, pickupDeclined: true }).localPickup).toBeUndefined();
    expect(withAutoLocalPickup({ ...pickup, manualPostagePaid: true, postagePaid: 5 }).postagePaid).toBe(5);
    expect(withAutoLocalPickup(pickup, true).localPickup).toBeUndefined();
  });
  it('leaves shipped orders alone', () => {
    const o = { shippingMethod: 'Canada Post' };
    expect(withAutoLocalPickup(o)).toBe(o);
  });
});
