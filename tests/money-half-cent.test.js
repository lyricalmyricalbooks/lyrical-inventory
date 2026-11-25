// A half cent rounds away from zero, as a till or a tax form does. The old
// rounding added a tiny constant before rounding, which only rescued amounts
// under about 8: 5% GST on 42.70 (2.135) came out 2.13, and a refund of
// 2.675 came out −2.67 while the sale was 2.68.
import { describe, it, expect } from 'vitest';
import { roundCents } from '../src/lib/money.js';
import { toCents, sumMoney } from '../src/lib/cents.js';

describe('half-cent rounding', () => {
  it('rounds a half cent up for amounts of any size', () => {
    expect(roundCents(2.135)).toBe(2.14);
    expect(roundCents(10.005)).toBe(10.01);
    expect(roundCents(42.7 * 0.05)).toBe(2.14);
    expect(roundCents(16.5 * 0.13)).toBe(2.15);
    for (let c = 0; c < 200000; c += 7) {
      const written = Number(((c * 10 + 5) / 1000).toFixed(3));
      expect(toCents(written)).toBe(c + 1);
    }
  });

  it('rounds a refund the same way as the sale', () => {
    expect(roundCents(-2.675)).toBe(-2.68);
    expect(roundCents(-0.125)).toBe(-0.13);
    expect(toCents(-2.135)).toBe(-214);
  });

  it('leaves amounts just under a half cent, drift and odd input as before', () => {
    expect(roundCents(2.13499)).toBe(2.13);
    expect(roundCents(0.1 + 0.2)).toBe(0.3);
    expect(Object.is(roundCents(-0.001), 0)).toBe(true);
    expect(roundCents('24.99')).toBe(24.99);
    expect(Number.isNaN(roundCents('abc'))).toBe(true);
    expect(toCents('abc')).toBe(0);
    expect(sumMoney([0.1, 0.2, '24.99'])).toBe(25.29);
  });
});
