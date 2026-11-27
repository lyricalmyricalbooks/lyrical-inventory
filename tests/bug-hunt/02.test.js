import { test, expect } from 'vitest';
import { toCents, sumMoney } from '../../src/lib/cents.js';
test('tiny', () => { expect(toCents(1e-7)).toBe(0); expect(sumMoney([1, 1e-7])).toBe(1); });
