import { describe, it, expect } from 'vitest';
import {
  CURRENCY_SYMBOL_TO_CODE,
  CODE_TO_SYMBOL,
  getSym,
  normalizeCurrencyCode,
  fmt,
  fmtNum,
  fmtD,
  getBookCurrencyCode,
  paymentSummary,
  buildPaymentMeta,
  cadEquivalentForSale,
  hexToRgba,
  PAYMENT_TYPE_DIRECT_TO_ARTIST,
  isDirectToArtistSale,
} from '../src/lib/money.js';

describe('getSym', () => {
  it('returns the known symbol for a 3-letter code', () => {
    expect(getSym('EUR')).toBe('€');
    expect(getSym('CAD')).toBe('CA$');
    expect(getSym('USD')).toBe('US$');
    expect(getSym('GBP')).toBe('£');
  });
  it('returns the input unchanged when the code is unknown', () => {
    expect(getSym('XYZ')).toBe('XYZ');
  });
});

describe('normalizeCurrencyCode', () => {
  it('returns the fallback for empty input', () => {
    expect(normalizeCurrencyCode('')).toBe('CAD');
    expect(normalizeCurrencyCode(null)).toBe('CAD');
    expect(normalizeCurrencyCode(undefined, 'EUR')).toBe('EUR');
  });
  it('normalizes mixed-case codes to uppercase', () => {
    expect(normalizeCurrencyCode('eur')).toBe('EUR');
    expect(normalizeCurrencyCode('Usd')).toBe('USD');
  });
  it('converts common symbols to codes', () => {
    expect(normalizeCurrencyCode('€')).toBe('EUR');
    expect(normalizeCurrencyCode('£')).toBe('GBP');
    expect(normalizeCurrencyCode('CA$')).toBe('CAD');
    expect(normalizeCurrencyCode('US$')).toBe('USD');
  });
  it('falls back when given non-letter garbage', () => {
    // Anything that isn't 3 ASCII letters falls back.
    expect(normalizeCurrencyCode('!@#', 'EUR')).toBe('EUR');
    expect(normalizeCurrencyCode('ab', 'CAD')).toBe('CAD');
    expect(normalizeCurrencyCode('toolong', 'CAD')).toBe('CAD');
  });
  it('accepts any 3-letter input as a currency code (by design)', () => {
    // The catalog supports user-defined currencies, so unknown 3-letter
    // codes are intentionally allowed through (uppercased).
    expect(normalizeCurrencyCode('zzz', 'CAD')).toBe('ZZZ');
  });
  it('accepts any 3-letter uppercase code as currency', () => {
    expect(normalizeCurrencyCode('NZD')).toBe('NZD');
    expect(normalizeCurrencyCode('sek')).toBe('SEK');
  });
});

describe('fmt', () => {
  it('formats integer cents-precision amounts with thousands separators', () => {
    expect(fmt(1234.5, 'EUR')).toBe('€1,234.50');
    expect(fmt(1000000, 'USD')).toBe('US$1,000,000.00');
  });
  it('handles zero and small numbers', () => {
    expect(fmt(0, 'EUR')).toBe('€0.00');
    expect(fmt(0.4, 'EUR')).toBe('€0.40');
  });
  it('rounds to two decimals', () => {
    expect(fmt(1.236, 'EUR')).toBe('€1.24');
    expect(fmt(1.234, 'EUR')).toBe('€1.23');
  });
  it('defaults to euro symbol', () => {
    expect(fmt(10)).toBe('€10.00');
  });
});

describe('fmtNum', () => {
  it('formats numbers to two decimals without a currency symbol', () => {
    expect(fmtNum(1.5)).toBe('1.50');
    expect(fmtNum(0)).toBe('0.00');
    expect(fmtNum(1000)).toBe('1000.00');
  });
});

describe('fmtD', () => {
  it('returns em-dash for empty or invalid input', () => {
    expect(fmtD('')).toBe('—');
    expect(fmtD(null)).toBe('—');
    expect(fmtD('not a date')).toBe('—');
    expect(fmtD('—')).toBe('—');
  });
  it('parses YYYY-MM-DD without timezone shifting', () => {
    // Using en-GB locale -> "1 Jan 2024" style output
    const out = fmtD('2024-01-15');
    expect(out).toMatch(/15 Jan 2024/);
  });
  it('formats a predefined Date object correctly', () => {
    // We use a date at noon UTC to ensure consistent formatting across timezones
    const d = new Date('2023-10-31T12:00:00Z');
    expect(fmtD(d)).toMatch(/31 Oct 2023/);
  });
  it('formats a numeric timestamp correctly', () => {
    // 1700050000000 = Wed Nov 15 2023 12:06:40 GMT+0000
    const timestamp = 1700050000000;
    expect(fmtD(timestamp)).toMatch(/15 Nov 2023/);
  });
});

describe('getBookCurrencyCode', () => {
  it('returns the code when book.currency is a known symbol', () => {
    expect(getBookCurrencyCode({ currency: '€' })).toBe('EUR');
    expect(getBookCurrencyCode({ currency: 'CA$' })).toBe('CAD');
  });
  it('passes through a 3-letter code as-is', () => {
    expect(getBookCurrencyCode({ currency: 'NZD' })).toBe('NZD');
  });
  it('falls back to EUR when book.currency is missing', () => {
    expect(getBookCurrencyCode({})).toBe('EUR');
  });
  it('falls back to EUR when book.currency is not 3 chars and not a known symbol', () => {
    expect(getBookCurrencyCode({ currency: 'XX' })).toBe('EUR');
    expect(getBookCurrencyCode({ currency: 'fivech' })).toBe('EUR');
  });
});

describe('paymentSummary', () => {
  const book = { currency: '€' };
  it('returns empty string for nullish or currency-less payments', () => {
    expect(paymentSummary(null, book)).toBe('');
    expect(paymentSummary({}, book)).toBe('');
  });
  it('omits FX details when payment currency matches book currency', () => {
    expect(paymentSummary({ currency: 'EUR', amount: 12 }, book)).toBe('Paid EUR 12.00');
  });
  it('includes FX rate + converted total when currencies differ', () => {
    const summary = paymentSummary(
      { currency: 'USD', amount: 13.5, rate: 1.07, convertedTotal: 12.62 },
      book
    );
    expect(summary).toBe('Paid USD 13.50 @ 1.07 → €12.62');
  });
  it('skips the rate part when no rate is available', () => {
    const summary = paymentSummary(
      { currency: 'USD', amount: 13.5, convertedTotal: 12.62 },
      book
    );
    expect(summary).toBe('Paid USD 13.50 → €12.62');
  });
});

describe('buildPaymentMeta', () => {
  const book = { currency: '€' };
  it('multiplies qty * unitPrice for the native-currency total', () => {
    const meta = buildPaymentMeta({ book, qty: 3, unitPrice: 12.5, fxEnabled: false });
    expect(meta).toEqual({
      currency: 'EUR',
      amount: 37.5,
      rate: null,
      convertedTotal: 37.5,
    });
  });
  it('preserves fx values when fxEnabled', () => {
    const meta = buildPaymentMeta({
      book,
      qty: 2,
      unitPrice: 20,
      fxEnabled: true,
      fxCur: 'USD',
      fxAmt: 44,
      fxRate: 1.1,
    });
    expect(meta).toEqual({
      currency: 'USD',
      amount: 44,
      rate: 1.1,
      convertedTotal: 40, // 2 * 20 in native currency
    });
  });
  it('drops a zero/negative fxRate to null', () => {
    const meta = buildPaymentMeta({
      book,
      qty: 1,
      unitPrice: 10,
      fxEnabled: true,
      fxCur: 'USD',
      fxAmt: 11,
      fxRate: 0,
    });
    expect(meta.rate).toBeNull();
  });
  it('coerces non-numeric qty/unitPrice to 0', () => {
    const meta = buildPaymentMeta({ book, qty: 'oops', unitPrice: null, fxEnabled: false });
    expect(meta.amount).toBe(0);
    expect(meta.convertedTotal).toBe(0);
  });
});

describe('cadEquivalentForSale', () => {
  it('uses the native total when the book sells in CAD', () => {
    expect(cadEquivalentForSale({ nativeCurrency: 'CAD', totalNative: 20 })).toBe(20);
  });
  it('normalizes CAD symbols for the native currency', () => {
    expect(cadEquivalentForSale({ nativeCurrency: 'CA$', totalNative: 12.5 })).toBe(12.5);
  });
  it('uses the CAD cash collected when a non-CAD book is paid in CAD', () => {
    expect(cadEquivalentForSale({
      nativeCurrency: 'EUR', totalNative: 10,
      payment: { currency: 'CAD', amount: 16.02 },
    })).toBe(16.02);
  });
  it('returns blank for a non-CAD book paid in a non-CAD currency', () => {
    // Left for the Sheets backend to convert via stored rate / live FX.
    expect(cadEquivalentForSale({
      nativeCurrency: 'EUR', totalNative: 10,
      payment: { currency: 'EUR', amount: 10 },
    })).toBe('');
  });
  it('returns blank for a non-CAD book with no payment info', () => {
    expect(cadEquivalentForSale({ nativeCurrency: 'GBP', totalNative: 8 })).toBe('');
  });
  it('ignores a CAD payment with a zero/missing amount', () => {
    expect(cadEquivalentForSale({
      nativeCurrency: 'USD', totalNative: 5,
      payment: { currency: 'CAD', amount: 0 },
    })).toBe('');
  });
  it('defaults a missing native currency to CAD (native total wins)', () => {
    expect(cadEquivalentForSale({ totalNative: 7.25 })).toBe(7.25);
  });
  it('coerces a non-numeric total to 0 for a CAD book', () => {
    expect(cadEquivalentForSale({ nativeCurrency: 'CAD', totalNative: 'oops' })).toBe(0);
  });
});

describe('hexToRgba', () => {
  it('converts hex to rgba with the given alpha', () => {
    expect(hexToRgba('#FF0000', 0.5)).toBe('rgba(255,0,0,0.5)');
    expect(hexToRgba('#00FF00', 1)).toBe('rgba(0,255,0,1)');
    expect(hexToRgba('#0000FF', 0)).toBe('rgba(0,0,255,0)');
  });
});

describe('CURRENCY_SYMBOL_TO_CODE / CODE_TO_SYMBOL round-trip', () => {
  it('every symbol in the symbol→code map decodes back via getSym', () => {
    for (const [, code] of Object.entries(CURRENCY_SYMBOL_TO_CODE)) {
      expect(CODE_TO_SYMBOL[code]).toBeDefined();
    }
  });
});

describe('isDirectToArtistSale', () => {
  it('detects the structured flag', () => {
    expect(isDirectToArtistSale({ directToArtist: true })).toBe(true);
  });
  it('detects the legacy paymentType field', () => {
    expect(isDirectToArtistSale({ paymentType: PAYMENT_TYPE_DIRECT_TO_ARTIST })).toBe(true);
  });
  it('detects the legacy payment.type field', () => {
    expect(isDirectToArtistSale({ payment: { type: PAYMENT_TYPE_DIRECT_TO_ARTIST } })).toBe(true);
  });
  it('falls back to note text for old records', () => {
    expect(isDirectToArtistSale({ notes: 'Sold at fair · Payment directly to artist' })).toBe(true);
  });
  it('is false for publisher-collected sales and empty input', () => {
    expect(isDirectToArtistSale({ paymentType: 'Payment directly to publisher' })).toBe(false);
    expect(isDirectToArtistSale({ notes: 'regular sale' })).toBe(false);
    expect(isDirectToArtistSale({})).toBe(false);
    expect(isDirectToArtistSale(null)).toBe(false);
  });
});
