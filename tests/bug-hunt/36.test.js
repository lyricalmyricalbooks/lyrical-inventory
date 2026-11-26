import { test, expect } from 'vitest';
import { planCurrencyChange } from '../../src/lib/currency-migration.js';
test('GBP-stamped row not converted with EUR->CAD rate', () => {
  const state = { hist: [{ num: 1, date: '2026-01-01', price: 10, cur: 'GBP' }] };
  const plan = planCurrencyChange({ state, book: { currency: '€' }, from: 'EUR', to: 'CAD', rateFor: () => 1.5 });
  expect(plan.changes.length).toBe(0);
});
