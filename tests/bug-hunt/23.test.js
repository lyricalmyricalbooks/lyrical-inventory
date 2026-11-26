import { test, expect } from 'vitest';
import * as M from '../../src/lib/address-verification.js';
import * as F from '../../src/lib/address-verification.js';
for (const [n, m] of [['orig', M], ['fixed', F]]) test(n, () => {
  const addr = { name: '', street1: '1 Main St', city: 'Toronto', state: 'ON', zip: 'M6G 3H1', country: 'CA' };
  expect(m.buildLegacyValidationPayload(addr).name).toBe('Recipient');
  const r = m.normalizeAddressVerification({ ...addr, name: 'Recipient', validation_results: { is_valid: true, messages: [] } }, addr);
  expect(r.corrections).toEqual([]);
  expect(r.status).toBe('valid');
});
