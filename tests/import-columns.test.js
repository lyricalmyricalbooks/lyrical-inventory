// An order-history import reads whatever a shop's export named its columns.
// A wrong guess here silently imports the wrong number of sales.
import { describe, it, expect } from 'vitest';
import { importAmount, importColumn, mapImportRow } from '../src/lib/import-columns.js';

describe('the order number column', () => {
  it('is never the order date, even when the date column comes first', () => {
    const row = { 'Order Date': '2026-03-01', 'Order #': '1001', Qty: 1, Price: 30 };
    expect(importColumn(row, 'num')).toBe('Order #');
    expect(mapImportRow(row)).toMatchObject({ num: '1001', rawDate: '2026-03-01' });
  });

  it('reads the common spellings', () => {
    expect(mapImportRow({ 'Order Number': 'A-7' }).num).toBe('A-7');
    expect(mapImportRow({ order_id: 'X9' }).num).toBe('X9');
    expect(mapImportRow({ Num: '12' }).num).toBe('12');
    expect(mapImportRow({ 'Order Date': '2026-03-01' }).num).toBe('');
  });
});

describe('quantities', () => {
  it('a blank quantity is one copy', () => {
    expect(mapImportRow({ Qty: '' }).qty).toBe(1);
    expect(mapImportRow({}).qty).toBe(1);
  });

  it('keeps 0 and refunds as written, so they are never imported as sales', () => {
    expect(mapImportRow({ Qty: 0 }).qty).toBe(0);
    expect(mapImportRow({ Qty: '-1', Price: '-30' }).qty).toBe(-1);
  });
});

describe('amounts as a spreadsheet writes them', () => {
  it.each([
    ['$1,250.00', 1250],
    ['1,250', 1250],
    ['30,00', 30],
    ['1.250,00', 1250],
    ['€ 40', 40],
    ['12.5', 12.5],
    [7, 7],
  ])('%s → %s', (cell, value) => {
    expect(importAmount(cell)).toBe(value);
  });

  it('reads a European price in a row', () => {
    expect(mapImportRow({ 'Prix unitaire': '30,00', Qty: '2' })).toMatchObject({ price: 30, qty: 2 });
  });
});
