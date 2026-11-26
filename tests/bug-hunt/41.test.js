import { test, expect } from 'vitest';
import { createSection10Adjustment as A } from '../../src/lib/inventory-adjustment.js';
import { createSection10Adjustment as B } from '../../src/lib/inventory-adjustment.js';
const inp = { id:'a', title:'T', quantity:1, unitCostNative:10, fxRate:1, reason:'r', evidence:'e', date:'2025-02-30', nrvPerUnitNative:5, endingValueNative:5 };
test('orig rejects', () => { expect(() => A(inp)).toThrow(/valuation date/); });
test('copy rejects', () => { expect(() => B(inp)).toThrow(/valuation date/); });
