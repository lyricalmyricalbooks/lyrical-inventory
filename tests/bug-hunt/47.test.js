import { test, expect } from 'vitest';
import { orderParcelPlan } from '../../src/lib/order-parcel-prefill.js';
test('empty shipCustomsVal falls to listPrice', () => {
  const p = orderParcelPlan([{ bookId: 'b', qty: 1 }], { b: { title: 'T', shipCustomsVal: '', listPrice: 20 } });
  expect(p.customsUnitValue).toBe(20);
});
