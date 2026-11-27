import { test, expect } from 'vitest';
import { isCosmeticCorrection } from '../../src/lib/batch-shipping.js';
test('truncated zip completion is not cosmetic', () => {
  expect(isCosmeticCorrection({ field: 'zip', from: '9021', to: '90210' })).toBe(false);
  expect(isCosmeticCorrection({ field: 'zip', from: 'K1A', to: 'K1A 0B1' })).toBe(false);
  expect(isCosmeticCorrection({ field: 'zip', from: '90210', to: '90210-1234' })).toBe(true);
});
