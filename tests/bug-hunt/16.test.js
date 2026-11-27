import { test, expect } from 'vitest';
import { saleCodes, booksInDescription } from '../../src/lib/sale-codes.js';
const books = { a: { id:'a', title: 'Hound' }, b: { id:'b', title: 'Hou' } };
test('digit code', () => {
  const c = saleCodes(books);
  console.log(c);
  const code2 = Object.entries(c).find(([, v]) => /\d/.test(v));
  const r = booksInDescription(code2[1], books);
  console.log(r);
  expect(r).toEqual([{ bookId: code2[0], qty: 1, stated: false }]);
});
