import { test, expect } from 'vitest';
import { withPick, rememberedBook } from '../../src/lib/stripe-book-picks.js';
test('non-ascii note', () => {
  const p = { amount: 25, currency: 'eur', description: 'é'.repeat(40) };
  expect(rememberedBook(withPick([], p, 'book1', 1e12), p)).toBe('book1');
});
