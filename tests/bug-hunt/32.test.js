import { test, expect } from 'vitest';
const m = await import(process.env.FIX ? '../../src/lib/cashflow.js' : '../../src/lib/cashflow.js');
test('float', () => {
  const r = m.computeCashFlowMetrics({ taxCenter: { businessExpenses: [{baseAmount:0.1,date:'2026-01-01'},{baseAmount:0.2,date:'2026-01-02'}] } }, '2026');
  expect(r.operatingExpenses).toBe(0.3);
});
test('string', () => {
  const r = m.computeCashFlowMetrics({ taxCenter: { businessExpenses: [{baseAmount:'10.00',date:'2026-01-01'}] } }, '2026');
  expect(r.operatingExpenses).toBe(10);
});
