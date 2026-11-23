// The shared money and date displays: the edge cases each screen used to
// handle in its own copy of the formatter.
import { describe, it, expect } from 'vitest';
import { fmt, fmtWhole, fmtCode, fmtD as fmtDFromMoney } from '../src/lib/money.js';
import { fmtD, fmtDateTime, fmtLongDate } from '../src/lib/dates.js';
import { scanMoney } from '../src/lib/receipt-scan-checks.js';
import { receiptReviewItem } from '../src/lib/review-queue.js';
import { describeReceiptSweep } from '../src/lib/receipt-ready.js';

describe('fmt edge cases', () => {
  it('puts the minus before the symbol and never shows "-0.00"', () => {
    expect(fmt(-138.69, 'CAD')).toBe('-CA$138.69');
    expect(fmt(-0.001, 'CAD')).toBe('CA$0.00');
    expect(fmt(-0, 'EUR')).toBe('€0.00');
  });
  it('groups thousands on both sides of zero', () => {
    expect(fmt(1234567.891, 'CAD')).toBe('CA$1,234,567.89');
    expect(fmt(-1234.5, 'USD')).toBe('-US$1,234.50');
  });
  it('accepts numeric strings', () => {
    expect(fmt('12.5', 'CAD')).toBe('CA$12.50');
  });
  it('prints an unknown currency code as given, and a symbol as itself', () => {
    expect(fmt(5, 'NZD')).toBe('NZD5.00');
    expect(fmt(5, '$')).toBe('$5.00');
  });
  it('shows NaN for a missing amount rather than inventing a zero', () => {
    expect(fmt(undefined, 'CAD')).toBe('CA$NaN');
  });
  it('uses the euro only when the currency is undefined, not when it is blank', () => {
    expect(fmt(1, undefined)).toBe('€1.00');
    expect(fmt(1, '')).toBe('1.00');
  });
});

describe('fmtWhole edge cases', () => {
  it('reads a non-number as zero', () => {
    expect(fmtWhole(undefined, 'CAD')).toBe('CA$0');
    expect(fmtWhole('abc', 'CAD')).toBe('CA$0');
  });
  it('rounds half away from zero on the positive side only (Math.round)', () => {
    expect(fmtWhole(2.5, 'CAD')).toBe('CA$3');
    expect(fmtWhole(-2.5, 'CAD')).toBe('-CA$2');
  });
});

describe('fmtCode', () => {
  it('prints the code, a space and two decimals with no grouping', () => {
    expect(fmtCode(1234.5, 'usd')).toBe('USD 1234.50');
    expect(fmtCode(-5, 'EUR')).toBe('EUR -5.00');
  });
  it('falls back to CAD, or the fallback given, when there is no currency', () => {
    expect(fmtCode(3, '')).toBe('CAD 3.00');
    expect(fmtCode(3, null)).toBe('CAD 3.00');
    expect(fmtCode(3, undefined, 'EUR')).toBe('EUR 3.00');
  });
  it('reads anything that is not a number as 0.00', () => {
    expect(fmtCode(undefined, 'CAD')).toBe('CAD 0.00');
    expect(fmtCode('n/a', 'CAD')).toBe('CAD 0.00');
    expect(fmtCode('7.1', 'CAD')).toBe('CAD 7.10');
  });
});

describe('screens that print "CAD 12.00"', () => {
  it('the scan summary uses a symbol where it has one and the code where it does not', () => {
    expect(scanMoney(43.49, 'cad')).toBe('CA$43.49');
    expect(scanMoney(50, 'NZD')).toBe('NZD 50.00');
    expect(scanMoney('x', 'NZD')).toBe('NZD 0.00');
    expect(scanMoney(5, '')).toBe('CA$5.00');
  });

  it('the one-tap filing alert names each easy receipt with its amount', () => {
    const easy = { vendor: 'Canada Post', amount: 12.5, currency: 'cad', category: 'Postage', confidence: 0.95, date: '2025-03-04' };
    const ready = [easy, { ...easy, vendor: 'Staples', amount: 1234, currency: '' }];
    const { detail } = describeReceiptSweep({ found: ready, ready });
    expect(detail).toBe('Ready to file: Canada Post CAD 12.50 → Postage; Staples CAD 1234.00 → Postage.');
  });

  it('the review list prints a receipt amount the same way', () => {
    const item = receiptReviewItem({ vendor: 'Adobe', amount: 22.6, currency: 'usd', category: 'Software', confidence: 0.4, date: '2025-03-04' });
    expect(item.subtitle).toBe('USD 22.60 · Software');
  });
});

describe('fmtD', () => {
  it('is the same function whether imported from money.js or dates.js', () => {
    expect(fmtDFromMoney).toBe(fmtD);
  });
  it('reads a bare day at local noon so it never slips a day', () => {
    expect(fmtD('2025-01-01')).toBe('1 Jan 2025');
    expect(fmtD('2025-12-31')).toBe('31 Dec 2025');
  });
  it('shows a dash for a missing or unreadable date', () => {
    expect(fmtD(undefined)).toBe('—');
    expect(fmtD('Invalid Date')).toBe('—');
    expect(fmtD(new Date('nope'))).toBe('—');
  });
  it('matches toLocaleDateString in en-GB for a Date', () => {
    const d = new Date(2024, 1, 29, 23, 59);
    expect(fmtD(d)).toBe(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
  });
});

describe('fmtDateTime', () => {
  it('is blank for nothing or an unreadable date', () => {
    expect(fmtDateTime('')).toBe('');
    expect(fmtDateTime(null)).toBe('');
    expect(fmtDateTime('garbage')).toBe('');
  });
  it('is the local date then the 24-hour time to the minute', () => {
    const d = new Date(2025, 2, 4, 9, 7, 45);
    expect(fmtDateTime(d.toISOString())).toBe(`${d.toLocaleDateString()} 09:07`);
    expect(fmtDateTime(d.getTime())).toBe(`${d.toLocaleDateString()} 09:07`);
  });
});

describe('fmtLongDate', () => {
  it('writes the month out in the locale asked for', () => {
    const d = new Date(2025, 2, 4);
    expect(fmtLongDate(d, 'en-CA')).toBe('March 4, 2025');
    expect(fmtLongDate(d, 'en-GB')).toBe('4 March 2025');
  });
  it('matches toLocaleDateString in the viewer\'s own locale', () => {
    const d = new Date(2025, 10, 23);
    expect(fmtLongDate(d)).toBe(d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
  });
  it('keeps each locale separate once cached', () => {
    const d = new Date(2025, 0, 2);
    fmtLongDate(d, 'en-GB');
    expect(fmtLongDate(d, 'en-CA')).toBe('January 2, 2025');
    expect(fmtLongDate(d, 'en-GB')).toBe('2 January 2025');
  });
  it('says "Invalid Date" instead of throwing, as toLocaleDateString did', () => {
    expect(fmtLongDate(new Date('2025-02-30T00:00:00x'))).toBe('Invalid Date');
  });
});
