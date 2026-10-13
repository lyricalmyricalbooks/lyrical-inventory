import { expect, test } from 'vitest';
import { fmt, fmtWhole } from '../src/lib/money.js';

// The Tax Centre's Net Cash Flow read "CA$-138.69": the minus landed after the
// currency symbol, which reads like a formatting error on a headline number.
// fmtWhole already put the sign first; fmt now matches it.
test('a negative amount puts the minus before the currency symbol', () => {
  expect(fmt(-138.69, 'CA$')).toBe('-CA$138.69');
  expect(fmt(-1234.5, '€')).toBe('-€1,234.50');
  expect(fmtWhole(-1234, 'CA$')).toBe('-CA$1,234');
});

test('positive amounts and zero are unchanged, and a rounding-to-zero never shows a minus', () => {
  expect(fmt(1234.5, 'CA$')).toBe('CA$1,234.50');
  expect(fmt(0, 'CA$')).toBe('CA$0.00');
  expect(fmt(-0.001, 'CA$')).toBe('CA$0.00');
});
