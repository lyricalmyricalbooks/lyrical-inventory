import { test, expect } from 'vitest';
import { backfillSaleFees } from '../../src/lib/stripe-sale-fee.js';
test('split first row not given whole fee', () => {
  const states = { a: { hist: [{ sheetsId: 'stripe-ch_1', payment: { amount: 10 } }] },
                   b: { hist: [{ sheetsId: 'stripe-ch_1-2', payment: { amount: 10 } }] } };
  backfillSaleFees(states, [{ id: 'ch_1', fee: 1.2, feeCurrency: 'CAD' }]);
  expect(states.a.hist[0].payment.fee).toBeUndefined();
});
