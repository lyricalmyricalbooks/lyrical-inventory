import { test, expect } from 'vitest';
import { addressVerdictBlocker } from '../../src/lib/batch-shipping.js';
test('partial match with no suggestion needs a person', () => {
  expect(addressVerdictBlocker({ status:'partially_valid', corrections:[], reasons:[{type:'warning',description:'Unit number missing'}] })).not.toBe('');
});
