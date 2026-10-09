import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLooseNumber, booksNamedInText } from '../src/lib/invoices.js';

const main = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/main.js'), 'utf8');

describe('invoice number parsing', () => {
  it('reads thousands commas as thousands', () => {
    expect(parseLooseNumber('1,500')).toBe(1500);
    expect(parseLooseNumber('$2,000')).toBe(2000);
    expect(parseLooseNumber('1,234,567')).toBe(1234567);
  });
  it('still reads a lone decimal comma as a decimal', () => {
    expect(parseLooseNumber('12,5')).toBe(12.5);
    expect(parseLooseNumber('0,500')).toBe(0.5);
    expect(parseLooseNumber('1.234,50')).toBe(1234.5);
  });
});

describe('book title detection', () => {
  const books = [{ id: 'a', title: 'Cat' }, { id: 'b', title: 'Dog Days' }];
  it('does not match a title inside another word', () => {
    expect(booksNamedInText('Catalog fee', books)).toEqual([]);
    expect(booksNamedInText('3 x Cat (paperback)', books)).toEqual(['a']);
  });
});

describe('main.js money guards', () => {
  it('saves a 0% store commission as 0', () => {
    expect(main).not.toMatch(/parseFloat\(\$\('ns-rate'\)\.value\) \|\| 40/);
    expect(main).not.toMatch(/parseFloat\(\$\('es-rate'\)\.value\) \|\| st\.rate/);
    expect(main).not.toMatch(/parseFloat\(\$\('send-rate'\)\.value\) \|\| st\.rate/);
  });
  it('manual sale keeps a typed 0 price and rejects negative quantity', () => {
    expect(main).not.toMatch(/parseFloat\(\$\('m-price'\)\.value\) \|\| book\.listPrice/);
    expect(main).toMatch(/qty < 1 \|\| rawPrice < 0/);
  });
  it('does not persist the overdue flag', () => {
    expect(main).not.toMatch(/inv\._overdue = true/);
  });
  it('editing an invoice keeps Stripe charge stamps', () => {
    expect(main).toMatch(/payload\.stripeChargeId = old\.stripeChargeId/);
    expect(main).toMatch(/payload\.stripePartPayments = old\.stripePartPayments/);
  });
  it('approving a submission keeps its date and author', () => {
    expect(main).toMatch(/\{ date: raw\.date, enteredBy: 'Artist' \}/);
  });
});
