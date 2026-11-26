import { test, expect } from 'vitest';
import { describePlan } from '../../src/lib/currency-migration.js';
test('missing rates not reported as already converted', () => {
  const s = describePlan({ from:'USD', to:'CAD', changes:[], skipped:[], missingRate:10 });
  expect(s).not.toMatch(/already in CAD/);
});
