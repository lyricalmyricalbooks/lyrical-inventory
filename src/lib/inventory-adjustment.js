import { roundCents } from './money.js';

function positiveWhole(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 0;
}

function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) &&
    !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function commonRecord(input, type, endingValueNative) {
  const quantity = positiveWhole(input.quantity);
  if (!quantity) throw new Error('Quantity must be a positive whole number');
  if (!validIsoDate(input.date)) throw new Error('A valid valuation date is required');

  const unitCostNative = Number(input.unitCostNative);
  const fxRate = Number(input.fxRate);
  if (!(unitCostNative >= 0)) throw new Error('Original unit cost is required');
  if (!(fxRate > 0)) throw new Error('A valid CAD exchange rate is required');
  if (!String(input.reason || '').trim()) throw new Error('A reason is required');
  if (!String(input.evidence || '').trim()) throw new Error('Evidence is required');

  const originalCostCAD = roundCents(quantity * unitCostNative * fxRate);
  const endingValueCAD = roundCents(quantity * endingValueNative * fxRate);
  const writeDownCAD = roundCents(originalCostCAD - endingValueCAD);
  const priorWriteDownCAD = type === 'section10'
    ? roundCents(Math.max(0, Number(input.priorWriteDownCAD) || 0))
    : 0;
  const taxAdjustmentCAD = type === 'section10'
    ? roundCents(writeDownCAD - priorWriteDownCAD)
    : writeDownCAD;

  return {
    id: input.id,
    date: input.date,
    desc: type === 'section10'
      ? `Section 10 inventory valuation — ${input.title}`
      : `Inventory disposal — ${input.title}`,
    cat: 'Inventory Valuation Adjustment',
    currency: 'CAD',
    amount: taxAdjustmentCAD,
    baseAmount: taxAdjustmentCAD,
    fxRate: 1,
    ref: `ITA s.10 · ${input.title}`,
    receipt: '',
    receiptFiles: [],
    receiptExempt: true,
    nonCash: true,
    affectsCashFlow: false,
    inventoryAdjustment: {
      type,
      bookId: input.bookId,
      title: input.title,
      quantity,
      currency: input.currency || 'CAD',
      fxRate,
      unitCostNative: roundCents(unitCostNative),
      nrvPerUnitNative: roundCents(endingValueNative),
      originalCostCAD,
      endingValueCAD,
      writeDownCAD,
      priorWriteDownCAD,
      closingWriteDownCAD: writeDownCAD,
      taxAdjustmentCAD,
      reason: String(input.reason || '').trim(),
      evidence: String(input.evidence || '').trim(),
      notes: String(input.notes || '').trim(),
      valuationMethod: 'lower-of-cost-and-fmv',
      physicalStockChanged: type === 'physical-disposal',
    },
  };
}

export function createSection10Adjustment(input) {
  const nrvPerUnitNative = Number(input.nrvPerUnitNative);
  if (!(nrvPerUnitNative >= 0)) throw new Error('NRV must be zero or greater');
  if (nrvPerUnitNative > Number(input.unitCostNative)) {
    throw new Error('NRV cannot exceed original unit cost');
  }
  return commonRecord(input, 'section10', nrvPerUnitNative);
}

export function createInventoryDisposalExpense(input) {
  return commonRecord(input, 'physical-disposal', 0);
}

export function inventoryAdjustmentCsvRows(records) {
  const rows = [[
    'Date', 'Type', 'Book', 'Quantity', 'Currency', 'Unit Cost',
    'NRV / Ending Value', 'FX to CAD', 'Original Cost CAD',
    'Ending Value CAD', 'Prior Closing Write-Down CAD',
    'Closing Write-Down CAD', 'Current-Year Tax Adjustment CAD',
    'Reason', 'Evidence', 'Notes',
    'Physical Stock Changed',
  ]];
  (records || []).forEach((record) => {
    const adjustment = record?.inventoryAdjustment;
    if (!adjustment) return;
    rows.push([
      record.date || '',
      adjustment.type === 'physical-disposal' ? 'Physical disposal' : 'Section 10 valuation',
      adjustment.title || '',
      adjustment.quantity,
      adjustment.currency || 'CAD',
      Number(adjustment.unitCostNative || 0).toFixed(2),
      Number(adjustment.nrvPerUnitNative || 0).toFixed(2),
      Number(adjustment.fxRate || 1).toFixed(4),
      Number(adjustment.originalCostCAD || 0).toFixed(2),
      Number(adjustment.endingValueCAD || 0).toFixed(2),
      Number(adjustment.priorWriteDownCAD || 0).toFixed(2),
      Number(adjustment.closingWriteDownCAD ?? adjustment.writeDownCAD ?? 0).toFixed(2),
      Number(adjustment.taxAdjustmentCAD ?? adjustment.writeDownCAD ?? 0).toFixed(2),
      adjustment.reason || '',
      adjustment.evidence || '',
      adjustment.notes || '',
      adjustment.physicalStockChanged ? 'Yes' : 'No',
    ]);
  });
  return rows;
}
