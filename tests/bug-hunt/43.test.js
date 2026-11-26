import { test, expect } from 'vitest';
const mod = await import(process.env.FIXED ? '../../src/lib/inventory-adjustment.js' : '../../src/lib/inventory-adjustment.js');
test('blank NRV rejected', () => {
  expect(() => mod.createSection10Adjustment({ id:'a', bookId:'b', title:'t', quantity:10, unitCostNative:5, nrvPerUnitNative:Number(''), currency:'CAD', fxRate:1, date:'2026-01-01' })).toThrow();
});
