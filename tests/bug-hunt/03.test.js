import { test, expect } from 'vitest';
import { splitFee } from '../../src/lib/stripe-sale-fee.js';
test('parts non-negative and sum to fee', () => {
  const p = splitFee(0.02, [1,1,1,1]);
  expect(p.every(x => x >= 0)).toBe(true);
  expect(Math.round(p.reduce((a,b)=>a+b,0)*100)).toBe(2);
});
