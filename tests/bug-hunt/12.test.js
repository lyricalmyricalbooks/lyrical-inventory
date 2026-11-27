import { test, expect } from 'vitest';
const mod = await import(process.env.FIXED ? '../../src/lib/market-card-check.js' : '../../src/lib/market-card-check.js');
test('two identical card sales without number', () => {
  const e = { chan:'Book Fair', date:'2026-11-20', notes:'Card', qty:1, price:10 };
  const r = mod.checkMarketCards([{bookId:'b',entry:{...e}},{bookId:'b',entry:{...e}}], '2026-11-20', [{id:'c1',amount:10},{id:'c2',amount:10}]);
  expect(r.missing).toEqual([]);
});
