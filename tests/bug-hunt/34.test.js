import { test, expect } from 'vitest';
import { deductibleAmount } from '../../src/lib/deductibility.js';
test('half-up, symmetric', () => {
  expect(deductibleAmount('Meals & Entertainment', 2.05)).toBe(1.03);
  expect(deductibleAmount('Meals & Entertainment', -1.01)).toBe(-deductibleAmount('Meals & Entertainment', 1.01));
});
