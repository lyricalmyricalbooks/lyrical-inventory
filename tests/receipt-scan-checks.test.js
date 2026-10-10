import { describe, it, expect } from 'vitest';
import {
  checkReceiptMath,
  isCurrencyCode,
  normalizeVendorKey,
  parseScannedAmount,
  scanDateConcern,
  scanReadChecks,
  scanUncertainFields,
  vendorFilingHabit,
  vendorHabitIndex,
} from '../src/lib/receipt-scan-checks.js';

// What a scanned receipt is checked against before the owner logs it. Every
// rule here decides whether the screen tells the owner to look again, so the
// failure that matters most is a check that cries wolf on a good receipt — a
// warning on every scan is a warning nobody reads.

describe('parseScannedAmount — a figure however the reader wrote it', () => {
  it.each([
    [42.5, 42.5],
    ['1,234.56', 1234.56],
    ['$45.00 CAD', 45],
    ['CA$ 12.00', 12],
    ['12,50 $', 12.5], // French-Canadian: the old parser made this 1250
    ['1.234,56 €', 1234.56],
    ['1 234,56', 1234.56],
    ['1,234', 1234],
    ['1.234.567', 1234567],
    ['-5.00', -5],
    ['(12.50)', -12.5],
  ])('%j → %d', (input, want) => {
    expect(parseScannedAmount(input)).toBeCloseTo(want, 2);
  });

  it.each([null, undefined, '', 'free', NaN, Infinity])('%j → 0, never NaN', (input) => {
    expect(parseScannedAmount(input)).toBe(0);
  });
});

describe('isCurrencyCode', () => {
  it('knows real currencies and refuses made-up codes', () => {
    expect(isCurrencyCode('AUD')).toBe(true);
    expect(isCurrencyCode('gbp')).toBe(true);
    expect(isCurrencyCode('ZZZ')).toBe(false);
    expect(isCurrencyCode('$')).toBe(false);
    expect(isCurrencyCode('')).toBe(false);
  });
});

describe('checkReceiptMath — do the figures add up to the total?', () => {
  it('passes a receipt whose items and tax come to the total', () => {
    const m = checkReceiptMath({ amount: 43.49, subtotal: 38.5, tax: 4.99 });
    expect(m.status).toBe('adds-up');
  });

  it('allows the cent or two a per-line tax receipt is out by', () => {
    expect(checkReceiptMath({ amount: 43.5, subtotal: 38.5, tax: 4.99 }).status).toBe('adds-up');
  });

  it('counts shipping, tip and discount', () => {
    expect(checkReceiptMath({ amount: 52, subtotal: 50, discount: 5, shipping: 4, tip: 0, tax: 3 }).status).toBe('adds-up');
    expect(checkReceiptMath({ amount: 60, subtotal: 45, tax: 5, tip: 10 }).status).toBe('adds-up');
  });

  it('catches the subtotal handed back as the total, and says what the total is', () => {
    const m = checkReceiptMath({ amount: 38.5, subtotal: 38.5, tax: 4.99 });
    expect(m.status).toBe('before-tax');
    expect(m.expected).toBeCloseTo(43.49, 2);
  });

  it('does not cry wolf on a VAT receipt whose prices already include the tax', () => {
    const m = checkReceiptMath({ amount: 120, subtotal: 120, tax: 20, taxIncluded: true });
    expect(m.status).toBe('adds-up');
    expect(m.taxIncluded).toBe(true);
  });

  it('reports figures that come to something else entirely', () => {
    const m = checkReceiptMath({ amount: 99, subtotal: 38.5, tax: 4.99 });
    expect(m.status).toBe('mismatch');
    expect(m.expected).toBeCloseTo(43.49, 2);
  });

  it('claims nothing when there is no breakdown to check', () => {
    expect(checkReceiptMath({ amount: 20 }).status).toBe('unchecked');
    expect(checkReceiptMath({ amount: 20, subtotal: 0, tax: 0 }).status).toBe('unchecked');
    // One figure printed as both subtotal and total proves nothing.
    expect(checkReceiptMath({ amount: 20, subtotal: 20 }).status).toBe('unchecked');
    expect(checkReceiptMath({ amount: 0, subtotal: 20, tax: 2 }).status).toBe('unchecked');
  });

  it('reads the breakdown however it was written', () => {
    expect(checkReceiptMath({ amount: '43,49', subtotal: '38,50', tax: '4,99' }).status).toBe('adds-up');
  });
});

describe('scanDateConcern — a date worth a second look', () => {
  const today = '2026-10-10';

  it('accepts today, yesterday and tomorrow (a receipt from a later time zone)', () => {
    expect(scanDateConcern('2026-10-10', today)).toBeNull();
    expect(scanDateConcern('2026-10-09', today)).toBeNull();
    expect(scanDateConcern('2026-10-11', today)).toBeNull();
  });

  it('suggests day and month swapped for a date read the wrong way round', () => {
    // 12/03 read American-style: 3 December, when it was 12 March.
    expect(scanDateConcern('2026-12-03', today)).toEqual({ kind: 'future', suggestion: '2026-03-12' });
  });

  it("suggests last year for a December receipt read in January with no year on it", () => {
    expect(scanDateConcern('2027-12-28', '2027-01-05')).toEqual({ kind: 'future', suggestion: '2026-12-28' });
  });

  it('still flags a future date when nothing better fits', () => {
    expect(scanDateConcern('2029-05-20', today)).toEqual({ kind: 'future', suggestion: '' });
  });

  it('flags a date more than two years back — a misread year, usually', () => {
    expect(scanDateConcern('2016-10-01', today)).toEqual({ kind: 'old' });
    expect(scanDateConcern('2025-01-01', today)).toBeNull();
  });

  it('ignores anything that is not a real date', () => {
    expect(scanDateConcern('2026-02-30', today)).toBeNull();
    expect(scanDateConcern('', today)).toBeNull();
  });
});

describe('vendor habits — how this ledger has filed a shop before', () => {
  it('gives one spelling to every way a receipt prints a shop name', () => {
    expect(normalizeVendorKey('STAPLES #1234')).toBe('staples');
    expect(normalizeVendorKey('Staples Inc.')).toBe('staples');
    expect(normalizeVendorKey('staples.ca')).toBe('staples');
    expect(normalizeVendorKey('Amazon.co.uk')).toBe('amazon');
    expect(normalizeVendorKey('Café Olé Ltée')).toBe('cafe ole');
  });

  const ledger = [
    { desc: 'Staples — printer paper', cat: 'Office Supplies' },
    { desc: 'Staples Business Depot — toner', cat: 'Office Supplies' },
    { desc: 'Staples printer ink', cat: 'Office Supplies' },
    { desc: 'Canada Post — stamps', cat: 'Shipping & Postage' },
    { vendor: 'Lulu', desc: 'Proof copies', cat: 'Printing & Production' },
    { vendor: 'Lulu', desc: 'Print run', cat: 'Printing & Production' },
    { desc: 'Post-it notes', cat: 'Office Supplies' },
  ];
  const index = vendorHabitIndex(ledger);

  it('finds a settled habit across the spellings', () => {
    expect(vendorFilingHabit('STAPLES #0091', index)).toEqual({ category: 'Office Supplies', count: 2, of: 2 });
    expect(vendorFilingHabit('Lulu Inc', index)).toEqual({ category: 'Printing & Production', count: 2, of: 2 });
  });

  it('never takes a different shop that starts with the same name for this one', () => {
    const aws = vendorHabitIndex([
      { desc: 'Amazon Web Services — hosting', cat: 'Software & Subscriptions' },
      { desc: 'Amazon Web Services — storage', cat: 'Software & Subscriptions' },
      { vendor: 'Amazon Web Services', desc: 'Backups', cat: 'Software & Subscriptions' },
    ]);
    expect(vendorFilingHabit('Amazon.ca', aws)).toBeNull();
    // …and a named shop is not stretched over a longer name either.
    const amazon = vendorHabitIndex([{ desc: 'Amazon — ink', cat: 'Office Supplies' }, { desc: 'Amazon — tape', cat: 'Office Supplies' }]);
    expect(vendorFilingHabit('Amazon Web Services', amazon)).toBeNull();
  });

  it('needs at least two past receipts', () => {
    expect(vendorFilingHabit('Canada Post', index)).toBeNull();
  });

  it('matches whole words only, so "Post" is not "Post-it"', () => {
    expect(vendorFilingHabit('Post', index)).toBeNull();
  });

  it('follows no habit when the past filings disagree', () => {
    const split = vendorHabitIndex([
      { desc: 'Amazon — ink', cat: 'Office Supplies' },
      { desc: 'Amazon — reference books', cat: 'Books, Research & Reference' },
      { desc: 'Amazon — tape', cat: 'Packaging Materials' },
    ]);
    expect(vendorFilingHabit('Amazon', split)).toBeNull();
  });

  it('never repeats "Other", and only offers a category the form has', () => {
    const others = vendorHabitIndex([{ desc: 'Kiosk', cat: 'Other' }, { desc: 'Kiosk', cat: 'Other' }]);
    expect(vendorFilingHabit('Kiosk', others)).toBeNull();
    expect(vendorFilingHabit('Staples', index, { allowed: ['Travel'] })).toBeNull();
  });

  it('ignores voided expenses', () => {
    const voided = vendorHabitIndex([
      { desc: 'Uline — boxes', cat: 'Travel', voided: true },
      { desc: 'Uline — boxes', cat: 'Travel', voided: true },
    ]);
    expect(vendorFilingHabit('Uline', voided)).toBeNull();
  });
});

describe('scanUncertainFields', () => {
  it("keeps only the reader's field names it knows", () => {
    expect([...scanUncertainFields({ uncertain: ['Amount', 'date', 'colour'] })]).toEqual(['amount', 'date']);
    expect(scanUncertainFields({}).size).toBe(0);
  });
});

describe('scanReadChecks — what the summary says', () => {
  it('says nothing to worry about on a clean receipt, and says why it is clean', () => {
    const checks = scanReadChecks({ math: checkReceiptMath({ amount: 43.49, subtotal: 38.5, tax: 4.99 }), currency: 'CAD' });
    expect(checks.every(c => c.tone === 'ok')).toBe(true);
    expect(checks[0].text).toMatch(/items CA\$38\.50 \+ tax CA\$4\.99/);
  });

  it('puts an already-logged receipt first, ahead of everything else', () => {
    const checks = scanReadChecks({
      duplicate: { desc: 'Staples — paper', date: '2026-10-01' },
      math: checkReceiptMath({ amount: 38.5, subtotal: 38.5, tax: 4.99 }),
      currency: 'CAD',
    });
    expect(checks[0].text).toMatch(/already in your ledger/);
    expect(checks[1].fix).toEqual({ field: 'amount', value: '43.49', label: 'Use CA$43.49' });
  });

  it('offers the likely date as a one-tap fix', () => {
    const [check] = scanReadChecks({ dateConcern: { kind: 'future', suggestion: '2026-03-12' } });
    expect(check.fix).toMatchObject({ field: 'date', value: '2026-03-12' });
  });

  it('names a habit that overrode the reader, in words', () => {
    const [check] = scanReadChecks({
      habit: { category: 'Office Supplies', count: 4, of: 4 }, habitOverrode: true, vendor: 'Staples',
    });
    expect(check.text).toBe('Filed under Office Supplies, the way you filed your last 4 Staples receipts.');
  });

  it('writes money with no symbol as its code', () => {
    const [check] = scanReadChecks({ math: checkReceiptMath({ amount: 50, subtotal: 50, tax: 5 }), currency: 'BRL' });
    expect(check.text).toMatch(/BRL 55\.00/);
  });

  it('names every box the AI flagged that nothing else explains', () => {
    const [check] = scanReadChecks({ unsure: ['category', 'receipt number'] });
    expect(check).toMatchObject({ tone: 'warn', text: "The AI wasn't sure about the category and receipt number. Check those boxes against the receipt." });
  });

  it('says which date it read when the date looks wrong', () => {
    const [check] = scanReadChecks({ date: '2026-12-03', dateConcern: { kind: 'future', suggestion: '2026-03-12' } });
    expect(check.text).toBe("The AI read the date as 2026-12-03, which hasn't happened yet. It's probably 2026-03-12.");
  });

  it('speaks to the fields it could not read at all', () => {
    const [check] = scanReadChecks({ missing: ['total', 'date'] });
    expect(check.text).toBe("The AI couldn't read the total and date. Type them in from the receipt.");
  });
});
