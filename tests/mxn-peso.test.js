import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  CODE_TO_SYMBOL,
  CURRENCY_SYMBOL_TO_CODE,
  getSym,
  fmt,
  normalizeCurrencyCode,
  getBookCurrencyCode,
} from '../src/lib/money.js';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

describe('Mexican peso in the money helpers', () => {
  it('has a symbol, so an MXN price never renders as a bare code', () => {
    expect(CODE_TO_SYMBOL.MXN).toBe('MX$');
    expect(getSym('MXN')).toBe('MX$');
    expect(fmt(540, 'MXN')).toBe('MX$540.00');
  });

  it('normalizes the code in any casing', () => {
    expect(normalizeCurrencyCode('MXN')).toBe('MXN');
    expect(normalizeCurrencyCode('mxn')).toBe('MXN');
    expect(normalizeCurrencyCode(' Mxn ')).toBe('MXN');
  });

  it('normalizes the disambiguated peso symbols', () => {
    expect(normalizeCurrencyCode('MX$')).toBe('MXN');
    expect(normalizeCurrencyCode('mx$')).toBe('MXN');
    expect(normalizeCurrencyCode('Mex$')).toBe('MXN');
    expect(normalizeCurrencyCode('$MXN')).toBe('MXN');
  });

  it('still reads a bare "$" as CAD — the two currencies share the glyph', () => {
    // Mexico writes pesos as "$". Guessing MXN here would silently re-price the
    // whole Canadian catalog, so the bare symbol stays Canadian by design.
    expect(normalizeCurrencyCode('$')).toBe('CAD');
    expect(CURRENCY_SYMBOL_TO_CODE.$).toBe('CAD');
  });

  it('resolves a book priced in pesos, by code or by symbol', () => {
    expect(getBookCurrencyCode({ currency: 'MXN' })).toBe('MXN');
    expect(getBookCurrencyCode({ currency: 'MX$' })).toBe('MXN');
  });
});

describe('Mexican peso in the POS', () => {
  it('offers MXN as a transaction currency regardless of how books are priced', () => {
    const fn = mainJs.slice(mainJs.indexOf('function getPOSCurrencies'));
    expect(fn.slice(0, fn.indexOf('}'))).toContain("'MXN'");
  });

  it('seeds an offline MXN rate so a cart still totals with no signal', () => {
    const line = mainJs.split('\n').find((l) => l.includes('POS_DEFAULT_CAD_RATES ='));
    expect(line).toContain('MXN');
    // Rate is "CAD per 1 unit" — a peso is worth well under a Canadian dollar,
    // so an inverted seed would misprice every peso cart by ~180x.
    const seeded = Number(/MXN:\s*([\d.]+)/.exec(line)[1]);
    expect(seeded).toBeGreaterThan(0);
    expect(seeded).toBeLessThan(0.5);
  });
});

describe('Mexican peso in the currency pickers', () => {
  const pickers = [
    ['pos-currency', null], // populated from getPOSCurrencies() at render time
    ['pqr-currency', 'MXN'],
    ['qrp-base-cur', 'MXN'],
    ['st-currency', 'MXN'],
    ['inv-currency', 'MXN'],
    ['m-price-cur', 'MXN'],
    ['exp-cur', 'MXN'],
    ['tc-exp-cur', 'MXN'],
    ['tc-rec-cur', 'MXN'],
    ['edit-exp-cur', 'MXN'],
  ];

  // A <select> silently ignores `el.value = 'MXN'` when it has no such option,
  // leaving the PREVIOUS currency selected — a peso receipt logged as Canadian.
  // Every picker a Mexico City trip touches has to actually carry the option.
  for (const [id, code] of pickers) {
    if (!code) continue;
    it(`#${id} offers ${code}`, () => {
      const start = html.indexOf(`id="${id}"`);
      expect(start, `#${id} not found in index.html`).toBeGreaterThan(-1);
      const select = html.slice(start, html.indexOf('</select>', start));
      expect(select).toContain(`value="${code}"`);
    });
  }
});
