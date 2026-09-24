import { describe, it, expect } from 'vitest';
import {
  rateAgainstPaid,
  describeRatesAgainstPaid,
  newPostageLosses,
  describePostageLosses,
  shippingPriceCheck,
  describeShippingPriceCheck,
} from '../src/lib/shipping-price-check.js';

describe('a label against what the customer paid', () => {
  it('says how much more a label costs, and ignores small differences', () => {
    expect(rateAgainstPaid(15.2, 12)).toMatchObject({ losing: true, gap: 3.2, text: '$3.20 more than the customer paid' });
    expect(rateAgainstPaid(12.4, 12).losing).toBe(false);
    expect(rateAgainstPaid(9, 12).text).toBe('Covered by what the customer paid');
  });

  it('says nothing when the order has no shipping charge', () => {
    expect(rateAgainstPaid(10, 0)).toBeNull();
    expect(describeRatesAgainstPaid([10, 12], 0)).toBe('');
  });

  it('sums up a list of rates in one sentence', () => {
    expect(describeRatesAgainstPaid([9, 11], 12)).toMatch(/Every option here is covered/);
    expect(describeRatesAgainstPaid([9, 15, 18], 12)).toMatch(/2 of these 3 options cost more/);
    expect(describeRatesAgainstPaid([15, 18], 12)).toMatch(/may be too low/);
  });
});

describe('orders that lost money on postage', () => {
  const orders = [
    { num: '101', date: '2026-09-20', paid: 12, postage: 16, destination: 'United States' },
    { num: '102', date: '2026-09-21', paid: 12, postage: 11 },
    { num: '90', date: '2026-06-01', paid: 10, postage: 20 },
  ];

  it('announces nothing the first time a device looks, but remembers', () => {
    const r = newPostageLosses(orders, null, { today: '2026-09-24' });
    expect(r.fresh).toEqual([]);
    expect(r.remember).toEqual(['101']);
  });

  it('announces a new losing order once, and only recent ones', () => {
    const r = newPostageLosses(orders, [], { today: '2026-09-24' });
    expect(r.fresh.map(o => o.num)).toEqual(['101']);
    expect(newPostageLosses(orders, r.remember, { today: '2026-09-24' }).fresh).toEqual([]);
  });

  it('writes one plain message for one order and a summary for several', () => {
    const one = describePostageLosses([{ num: '101', paid: 12, postage: 16, gap: 4, destination: 'United States' }]);
    expect(one.title).toBe('Order #101 cost $4.00 more to post than the customer paid');
    expect(one.detail).toMatch(/to United States/);
    expect(describePostageLosses([{ num: '#LM-9', paid: 1, postage: 3, gap: 2 }]).title).toMatch(/^Order #LM-9 cost/);
    const many = describePostageLosses([{ num: '1', gap: 2 }, { num: '2', gap: 3 }]);
    expect(many.title).toBe('2 recent orders cost more to post than customers paid');
    expect(many.detail).toMatch(/\$5\.00 short/);
  });
});

describe('suggested website shipping prices', () => {
  const us = (paid, postage, qty = 1, date = '2026-09-01') => ({ region: 'US', date, paid, postage, qty });

  it('suggests a first-book and extra-book price where customers are undercharged', () => {
    const orders = [us(15, 19), us(15, 20), us(15, 21), us(15, 19.5), us(15, 22), us(22, 26, 2), us(22, 28, 3)];
    const [r] = shippingPriceCheck(orders, { today: '2026-09-24' });
    expect(r).toMatchObject({ region: 'US', singles: 5, typicalPaid: 15, typicalPostage: 21, suggestFirst: 21, undercharging: true });
    expect(r.suggestExtra).toBeGreaterThanOrEqual(1);
    const said = describeShippingPriceCheck([r]);
    expect(said.title).toBe('Your website shipping price for the United States is too low');
    expect(said.detail).toMatch(/charge \$21 for the first book and \$\d+ for each extra book/);
  });

  it('needs enough one-book orders, and ignores old orders', () => {
    expect(shippingPriceCheck([us(15, 20), us(15, 20)], { today: '2026-09-24' })).toEqual([]);
    const old = Array.from({ length: 6 }, () => us(10, 20, 1, '2025-01-01'));
    expect(shippingPriceCheck(old, { today: '2026-09-24' })).toEqual([]);
  });

  it('says nothing when shipping pays for itself', () => {
    const fine = Array.from({ length: 5 }, () => ({ region: 'ON', date: '2026-09-01', paid: 14, postage: 12, qty: 1 }));
    const results = shippingPriceCheck(fine, { today: '2026-09-24' });
    expect(results[0].undercharging).toBe(false);
    expect(describeShippingPriceCheck(results).count).toBe(0);
  });
});
