import { test, expect } from 'vitest';
import { transferAuthorStock } from '../../src/lib/inventory.js';
test('records moved qty', () => {
  const s = { stock: 3, authorStock: 0 }; const book = { maxPrint: 3 };
  const { breakdown, transfer } = transferAuthorStock(s, book, 10);
  expect(breakdown.authorHeld).toBe(3);
  expect(transfer.qty).toBe(breakdown.authorHeld);
});
