import { describe, it, expect } from 'vitest';
import {
  CONFIDENCE_THRESHOLD,
  amountFromName,
  bestMatch,
  categoryFromName,
  dateFromName,
  planFile,
  scoreMatch,
  textSimilarity,
  tokens,
} from '../src/lib/receipt-match.js';

// The real corpus, taken from the actual "General receipts" folder. Tests
// written against invented names would pass while the real folder stayed a mess.
const REAL_FILES = [
  '2026-04-20_36.LyricalmyricalBooksInvoice.pdf',
  '2026-04-20_Gmail-YourGooglePlayOrderR.pdf',
  '2026-05-03_OrderDetails.pdf',
  '2026-05-11_Fattura23-2026.pdf',
  '2026-06-09_Invoice-FKJTGVYE-0001.pdf',
  '2026-07-30_Uber_CAD-13.93.pdf',
  '2026-08-01_Uber_CAD-8.19.pdf',
  '2026-08-05_Litoservice-s.r.l.-Printing-Volu.pdf',
  '2026-06-15_webcam-receipt-2026-06-15.jpg',
  'Ordine_17190_lyricalmyrical_books.pdf',
  'invoice amazon.pdf',
  'receipt_c917c7a6-2807-4b95-b96b-b8035.pdf',
  'Card authorization approved.pdf',
  'Your United Airlines booking c.pdf',
];

const KEYWORDS = {
  uber: 'Travel & Meals',
  hotel: 'Travel & Meals',
  flight: 'Travel & Meals',
  airlines: 'Travel & Meals',
  amazon: 'Office Supplies',
  printing: 'Printing & Production',
  printer: 'Printing & Production',
  post: 'Shipping & Postage',
  'post office': 'Shipping & Postage',
};

describe('dates out of real filenames', () => {
  it('reads the leading ISO date most files already carry', () => {
    expect(dateFromName('2026-07-30_Uber_CAD-13.93.pdf')).toBe('2026-07-30');
    expect(dateFromName('2026-04-20_36.LyricalmyricalBooksInvoice.pdf')).toBe('2026-04-20');
  });

  it('reads day-first dates, as European invoices tend to be written', () => {
    expect(dateFromName('Fattura_11.05.2026.pdf')).toBe('2026-05-11');
  });

  it('finds nothing in files that genuinely have no date', () => {
    expect(dateFromName('invoice amazon.pdf')).toBe('');
    expect(dateFromName('Card authorization approved.pdf')).toBe('');
    expect(dateFromName('Ordine_17190_lyricalmyrical_books.pdf')).toBe('');
  });

  it('does not invent a date out of a UUID full of digits', () => {
    // This is the trap: a bare hex id can contain something that parses.
    expect(dateFromName('receipt_c917c7a6-2807-4b95-b96b-b8035.pdf')).toBe('');
  });

  it('rejects impossible month and day values', () => {
    expect(dateFromName('2026-13-45_thing.pdf')).toBe('');
  });
});

describe('amounts out of real filenames', () => {
  it('reads a currency-anchored amount', () => {
    expect(amountFromName('2026-07-30_Uber_CAD-13.93.pdf')).toEqual({ amount: 13.93, currency: 'CAD' });
    expect(amountFromName('receipt USD 24.99.pdf')).toEqual({ amount: 24.99, currency: 'USD' });
  });

  it('refuses to read an order number as money', () => {
    // "Ordine_17190" is an order number. Reading it as $17,190 would file the
    // receipt against the wrong expense and be very hard to notice.
    expect(amountFromName('Ordine_17190_lyricalmyrical_books.pdf')).toBeNull();
    expect(amountFromName('2026-06-09_Invoice-FKJTGVYE-0001.pdf')).toBeNull();
  });

  it('accepts a dollar-sign amount without a currency code', () => {
    expect(amountFromName('lunch $42.50.pdf')).toEqual({ amount: 42.50, currency: '' });
  });
});

describe('vendor similarity', () => {
  it('ignores hex noise so a UUID never matches anything', () => {
    expect(textSimilarity('receipt_c917c7a6-2807-4b95-b96b-b8035', 'Uber trip')).toBe(0);
  });

  it('matches a vendor across punctuation and case', () => {
    expect(textSimilarity('2026-08-05_Litoservice-s.r.l.-Printing-Volu', 'Litoservice printing')).toBeGreaterThan(0.5);
  });

  it('drops words too short to mean anything', () => {
    expect(tokens('a of to the Uber')).toEqual(['the', 'uber']);
  });
});

describe('scoring a file against an expense', () => {
  const uberExpense = { date: '2026-07-30', desc: 'Uber to the printer', amount: 13.93, currency: 'CAD', cat: 'Travel & Meals' };

  it('scores date + amount + vendor as a confident match', () => {
    const { score, reasons } = scoreMatch({ name: '2026-07-30_Uber_CAD-13.93.pdf' }, uberExpense);
    expect(score).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
    expect(reasons).toContain('same date');
    expect(reasons).toContain('amount matches');
  });

  it('scores a same-day different-amount receipt below a same-day matching one', () => {
    // Two Ubers on one day is normal; the amount is what tells them apart.
    const right = scoreMatch({ name: '2026-07-30_Uber_CAD-13.93.pdf' }, uberExpense);
    const wrong = scoreMatch({ name: '2026-07-30_Uber_CAD-99.00.pdf' }, uberExpense);
    expect(right.score).toBeGreaterThan(wrong.score);
  });

  it('gives a bare UUID essentially nothing to go on', () => {
    const { score } = scoreMatch({ name: 'receipt_c917c7a6-2807-4b95-b96b-b8035.pdf' }, uberExpense);
    expect(score).toBeLessThan(CONFIDENCE_THRESHOLD);
  });
});

describe('picking the best expense', () => {
  const expenses = [
    { id: 1, date: '2026-07-30', desc: 'Uber to the printer', amount: 13.93, currency: 'CAD', cat: 'Travel & Meals' },
    { id: 2, date: '2026-08-01', desc: 'Uber home', amount: 8.19, currency: 'CAD', cat: 'Travel & Meals' },
  ];

  it('picks the right one of two similar expenses', () => {
    const r = bestMatch({ name: '2026-08-01_Uber_CAD-8.19.pdf' }, expenses);
    expect(r.match.id).toBe(2);
    expect(r.confident).toBe(true);
  });

  it('flags a tie as ambiguous rather than guessing', () => {
    // Two identical expenses on the same day — a coin flip that must be shown
    // to a human, not resolved silently.
    const twins = [
      { id: 1, date: '2026-07-30', desc: 'Uber', amount: 13.93, currency: 'CAD' },
      { id: 2, date: '2026-07-30', desc: 'Uber', amount: 13.93, currency: 'CAD' },
    ];
    const r = bestMatch({ name: '2026-07-30_Uber_CAD-13.93.pdf' }, twins);
    expect(r.ambiguous).toBe(true);
    expect(r.confident).toBe(false);
  });

  it('is not confident when there is nothing to match', () => {
    const r = bestMatch({ name: 'receipt_c917c7a6-2807.pdf' }, expenses);
    expect(r.confident).toBe(false);
  });

  it('handles an empty ledger', () => {
    expect(bestMatch({ name: 'x.pdf' }, []).confident).toBe(false);
  });
});

describe('category from the filename', () => {
  it('uses the app\'s own keyword map so the two cannot drift', () => {
    expect(categoryFromName('2026-07-30_Uber_CAD-13.93.pdf', KEYWORDS)).toBe('Travel & Meals');
    expect(categoryFromName('invoice amazon.pdf', KEYWORDS)).toBe('Office Supplies');
    expect(categoryFromName('Your United Airlines booking c.pdf', KEYWORDS)).toBe('Travel & Meals');
  });

  it('prefers the longer keyword when two match', () => {
    expect(categoryFromName('receipt from the post office.pdf', KEYWORDS)).toBe('Shipping & Postage');
  });

  it('returns nothing rather than guessing', () => {
    expect(categoryFromName('receipt_c917c7a6.pdf', KEYWORDS)).toBe('');
  });
});

describe('planning what happens to each real file', () => {
  const expenses = [
    { id: 1, date: '2026-07-30', desc: 'Uber to the printer', amount: 13.93, currency: 'CAD', cat: 'Travel & Meals' },
    { id: 2, date: '2026-08-05', desc: 'Litoservice printing volume', amount: 486, currency: 'EUR', cat: 'Printing & Production' },
  ];

  it('files a confident match against its expense', () => {
    const p = planFile({ name: '2026-07-30_Uber_CAD-13.93.pdf' }, expenses, KEYWORDS);
    expect(p.matched).toBe(true);
    expect(p.meta.cat).toBe('Travel & Meals');
    expect(p.meta.date).toBe('2026-07-30');
    expect(p.needsReview).toBe(false);
  });

  it('sends a nameless file to OCR rather than filing it on a guess', () => {
    const p = planFile({ name: 'receipt_c917c7a6-2807-4b95-b96b-b8035.pdf' }, expenses, KEYWORDS);
    expect(p.matched).toBe(false);
    expect(p.needsOcr).toBe(true);
    expect(p.needsReview).toBe(true);
  });

  it('still flags a file for review when it has a category but no date', () => {
    const p = planFile({ name: 'invoice amazon.pdf' }, expenses, KEYWORDS);
    expect(p.meta.cat).toBe('Office Supplies');
    expect(p.meta.date).toBe('');
    expect(p.needsReview).toBe(true);
  });

  it('accepts OCR results in place of filename parsing', () => {
    const p = planFile(
      { name: 'receipt_c917c7a6.pdf', date: '2026-08-05', vendor: 'Litoservice', amount: 486, currency: 'EUR' },
      expenses, KEYWORDS
    );
    expect(p.matched).toBe(true);
    expect(p.meta.cat).toBe('Printing & Production');
  });

  it('never marks a file as filed without a category', () => {
    // Filing into an unnamed folder is how receipts get lost a second time.
    REAL_FILES.forEach(name => {
      const p = planFile({ name }, expenses, KEYWORDS);
      if (!p.needsReview) expect(p.meta.cat).toBeTruthy();
    });
  });
});
