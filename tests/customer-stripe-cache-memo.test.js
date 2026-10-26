import { beforeEach, expect, test, vi } from 'vitest';

// customers.js imports main.js (and pos.js, which does too); stub both so the
// module loads on its own without booting the whole app.
vi.mock('../src/main.js', () => ({}));
vi.mock('../src/features/pos.js', () => ({ codeToSymbol: () => '' }));

const KEY = 'lm-customer-stripe';
const { _loadCustomerStripeCache, _saveCustomerStripeCache } = await import('../src/features/customers.js');

beforeEach(() => localStorage.clear());

test('the saved Stripe buyer list is parsed once and reused while unchanged', () => {
  _saveCustomerStripeCache([{ email: 'a@example.com', amount: 10 }]);
  const parse = vi.spyOn(JSON, 'parse');
  const first = _loadCustomerStripeCache();
  const second = _loadCustomerStripeCache();
  expect(parse).toHaveBeenCalledTimes(1);
  parse.mockRestore();
  expect(second).toEqual([{ email: 'a@example.com', amount: 10 }]);
  // Each caller gets its own array, so one can't reorder or trim another's.
  expect(second).not.toBe(first);
  first.length = 0;
  expect(_loadCustomerStripeCache()).toHaveLength(1);
});

test('a new pull (from this tab or another) is picked up at once', () => {
  _saveCustomerStripeCache([{ email: 'a@example.com' }]);
  expect(_loadCustomerStripeCache()).toHaveLength(1);
  localStorage.setItem(KEY, JSON.stringify([{ email: 'a@example.com' }, { email: 'b@example.com' }]));
  expect(_loadCustomerStripeCache().map(p => p.email)).toEqual(['a@example.com', 'b@example.com']);
});

test('nothing saved, unreadable or not a list all read as no buyers', () => {
  expect(_loadCustomerStripeCache()).toEqual([]);
  localStorage.setItem(KEY, '{not json');
  expect(_loadCustomerStripeCache()).toEqual([]);
  localStorage.setItem(KEY, '{"a":1}');
  expect(_loadCustomerStripeCache()).toEqual([]);
});
