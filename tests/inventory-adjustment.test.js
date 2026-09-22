import { describe, expect, it } from 'vitest';
import {
  createInventoryDisposalExpense,
  createSection10Adjustment,
  inventoryAdjustmentCsvRows,
} from '../src/lib/inventory-adjustment.js';

const baseInput = {
  id: 'iva_1',
  bookId: 'hound',
  title: 'The Hound',
  quantity: 10,
  unitCostNative: 12,
  currency: 'CAD',
  fxRate: 1,
  date: '2026-12-31',
  reason: 'Obsolete edition',
  evidence: 'No sales in 18 months; replacement edition released.',
  notes: 'Reviewed at year end.',
};

describe('Section 10 inventory adjustments', () => {
  it('records only the decline from original cost to year-end NRV', () => {
    const record = createSection10Adjustment({ ...baseInput, nrvPerUnitNative: 3 });

    expect(record.amount).toBe(90);
    expect(record.baseAmount).toBe(90);
    expect(record.nonCash).toBe(true);
    expect(record.affectsCashFlow).toBe(false);
    expect(record.receiptExempt).toBe(true);
    expect(record.inventoryAdjustment).toMatchObject({
      type: 'section10',
      quantity: 10,
      originalCostCAD: 120,
      endingValueCAD: 30,
      writeDownCAD: 90,
      physicalStockChanged: false,
      valuationMethod: 'lower-of-cost-and-fmv',
    });
  });

  it('converts the cost and NRV to CAD using the stored year-end rate', () => {
    const record = createSection10Adjustment({
      ...baseInput,
      currency: 'EUR',
      fxRate: 1.5,
      unitCostNative: 8,
      nrvPerUnitNative: 2,
      quantity: 4,
    });

    expect(record.inventoryAdjustment.originalCostCAD).toBe(48);
    expect(record.inventoryAdjustment.endingValueCAD).toBe(12);
    expect(record.baseAmount).toBe(36);
  });

  it('posts only the change from the prior closing write-down', () => {
    const unchanged = createSection10Adjustment({
      ...baseInput,
      nrvPerUnitNative: 3,
      priorWriteDownCAD: 90,
    });
    const recovery = createSection10Adjustment({
      ...baseInput,
      nrvPerUnitNative: 6,
      priorWriteDownCAD: 90,
    });

    expect(unchanged.baseAmount).toBe(0);
    expect(unchanged.inventoryAdjustment).toMatchObject({
      priorWriteDownCAD: 90,
      closingWriteDownCAD: 90,
      taxAdjustmentCAD: 0,
    });
    expect(recovery.baseAmount).toBe(-30);
    expect(recovery.inventoryAdjustment.taxAdjustmentCAD).toBe(-30);
  });

  it('rejects an NRV above cost because it is not a write-down', () => {
    expect(() => createSection10Adjustment({
      ...baseInput,
      nrvPerUnitNative: 13,
    })).toThrow('NRV cannot exceed original unit cost');
  });

  it('requires dated evidence for an audit-ready valuation', () => {
    expect(() => createSection10Adjustment({
      ...baseInput,
      nrvPerUnitNative: 3,
      evidence: '   ',
    })).toThrow('Evidence is required');
  });

  it('rejects zero quantities and malformed dates', () => {
    expect(() => createSection10Adjustment({
      ...baseInput,
      quantity: 0,
      nrvPerUnitNative: 3,
    })).toThrow('Quantity must be a positive whole number');
    expect(() => createSection10Adjustment({
      ...baseInput,
      date: 'not-a-date',
      nrvPerUnitNative: 3,
    })).toThrow('A valid valuation date is required');
  });
});

describe('physical inventory disposal', () => {
  it('creates a distinct cost-basis record that is marked to change stock', () => {
    const record = createInventoryDisposalExpense({
      ...baseInput,
      quantity: 2,
      reason: 'Water damaged and destroyed',
    });

    expect(record.baseAmount).toBe(24);
    expect(record.nonCash).toBe(true);
    expect(record.affectsCashFlow).toBe(false);
    expect(record.inventoryAdjustment).toMatchObject({
      type: 'physical-disposal',
      quantity: 2,
      writeDownCAD: 24,
      physicalStockChanged: true,
    });
  });
});

describe('accountant export rows', () => {
  it('exports the valuation basis, evidence, and physical-stock effect', () => {
    const record = createSection10Adjustment({ ...baseInput, nrvPerUnitNative: 3 });
    expect(inventoryAdjustmentCsvRows([record])).toEqual([
      ['Date', 'Type', 'Book', 'Quantity', 'Currency', 'Unit Cost', 'NRV / Ending Value', 'FX to CAD', 'Original Cost CAD', 'Ending Value CAD', 'Prior Closing Write-Down CAD', 'Closing Write-Down CAD', 'Current-Year Tax Adjustment CAD', 'Reason', 'Evidence', 'Notes', 'Physical Stock Changed'],
      ['2026-12-31', 'Section 10 valuation', 'The Hound', 10, 'CAD', '12.00', '3.00', '1.0000', '120.00', '30.00', '0.00', '90.00', '90.00', 'Obsolete edition', 'No sales in 18 months; replacement edition released.', 'Reviewed at year end.', 'No'],
    ]);
  });
});
