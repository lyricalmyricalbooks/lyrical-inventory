import { it, expect } from 'vitest';
import { refundExpense } from '../../src/lib/carriers/shippo-invoices.js';
it('nets in both currencies', () => {
  const o = { currency:'CAD', amount:11.28, origCurrency:'USD', origAmount:7.97, ref:'shippo:a' };
  const r = refundExpense({ id:'r1' }, o, 1);
  expect(r.amount + o.amount).toBeCloseTo(0);
  expect(r.origAmount + o.origAmount).toBeCloseTo(0);
});
