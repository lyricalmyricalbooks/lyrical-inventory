// Which receipts the inbox sweep may offer to file in one tap.
import { describe, it, expect } from 'vitest';
import { describeReceiptSweep, isReadyToFile } from '../src/lib/receipt-ready.js';

const draft = (extra = {}) => ({
  vendor: 'Canada Post', amount: 18.4, currency: 'CAD', category: 'Shipping & Postage',
  confidence: 0.95, date: '2026-09-20', ref: 'receipt-email:1', ...extra,
});

describe('a receipt ready to file in one tap', () => {
  it('is priced, categorised, confidently read, dated and new', () => {
    expect(isReadyToFile(draft())).toBe(true);
  });

  it('is not when anything is missing or doubtful', () => {
    expect(isReadyToFile(draft({ amountUnknown: true, amount: 0 }))).toBe(false);
    expect(isReadyToFile(draft({ category: 'Other' }))).toBe(false);
    expect(isReadyToFile(draft({ category: '' }))).toBe(false);
    expect(isReadyToFile(draft({ confidence: 0.6 }))).toBe(false);
    expect(isReadyToFile(draft({ date: '' }))).toBe(false);
    expect(isReadyToFile(draft(), { duplicate: true })).toBe(false);
  });
});

describe('what the alert says', () => {
  it('names what it would file, and says what else is waiting', () => {
    const ready = [draft(), draft({ vendor: 'Staples', amount: 42.1, category: 'Office Supplies', ref: 'r2' })];
    const said = describeReceiptSweep({ found: [...ready, draft({ category: 'Other', ref: 'r3' })], ready });
    expect(said.title).toBe('3 new receipts found in your inbox');
    expect(said.detail).toBe('Ready to file: Canada Post CAD 18.40 → Shipping & Postage; Staples CAD 42.10 → Office Supplies. 1 other needs a look first.');
    expect(said).toMatchObject({ canFile: true, fileLabel: 'File these 2' });
  });

  it('falls back to review when nothing is ready', () => {
    const said = describeReceiptSweep({ found: [draft({ amountUnknown: true })], ready: [] });
    expect(said.canFile).toBe(false);
    expect(said.detail).toContain('1 needs an amount');
  });

  it('says "File it" for a single receipt', () => {
    expect(describeReceiptSweep({ found: [draft()], ready: [draft()] }).fileLabel).toBe('File it');
  });
});
