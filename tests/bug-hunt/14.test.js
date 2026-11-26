import { test, expect } from 'vitest';
import { amountFromName as orig } from '../../src/lib/receipt-match.js';
import { amountFromName as fixed } from '../../src/lib/receipt-match.js';
const f = process.env.FIXED ? fixed : orig;
test('thousands', () => {
  expect(f('USD 1,234.56.pdf')?.amount).toBe(1234.56);
  expect(f('$1,234.56.pdf')?.amount).toBe(1234.56);
  expect(f('EUR-220,00.pdf')?.amount).toBe(220);
  expect(f('Uber_CAD-13.93.pdf')?.amount).toBe(13.93);
});
