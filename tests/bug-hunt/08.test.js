import { test, expect } from 'vitest';
import { computeCashFlowMetrics } from '../../src/lib/cashflow.js';
test('unrated USD book expense counts 0 like Tax Centre', () => {
  const r = computeCashFlowMetrics({ books:{b1:{title:'B',currency:'USD'}}, states:{b1:{expenses:[{amount:500,currency:'USD',date:'2026-03-01'}]}}, fxRateCache:{} }, 'all');
  expect(r.operatingExpenses).toBe(0);
});
