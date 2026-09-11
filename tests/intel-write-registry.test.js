import { describe, it, expect } from 'vitest';
import {
  WRITABLE_FIELDS,
  WRITE_TARGETS,
  fieldsForTarget,
  isbnCheckDigitValid,
  lookupField,
  prepareFieldValue,
} from '../src/lib/intel-write-registry.js';

// This table is the boundary between "the chat can change things" and "a
// language model can write arbitrary properties into a financial ledger". Most
// of what follows is about the second thing not being possible.

describe('what the panel is allowed to touch', () => {
  it('never exposes the fields that decide who can read a book', () => {
    // The author email builds the ownership map firestore.rules reads, so it is
    // an access-control boundary, not a data field.
    const all = Object.keys(WRITABLE_FIELDS).join(' ');
    expect(all).not.toMatch(/authorEmail|authorPassword/);
    expect(lookupField('book', 'authorEmail')).toBeNull();
  });

  it('never exposes a book identity that other records point at', () => {
    for (const f of ['id', 'urlParam']) expect(lookupField('book', f)).toBeNull();
  });

  it('gives every field a label, a risk level and a real target', () => {
    for (const [name, spec] of Object.entries(WRITABLE_FIELDS)) {
      expect(WRITE_TARGETS[spec.target], `${name} target`).toBeTruthy();
      expect(spec.label, `${name} label`).toBeTruthy();
      expect(['descriptive', 'money'], `${name} risk`).toContain(spec.risk);
      expect(typeof spec.coerce, `${name} coerce`).toBe('function');
      expect(typeof spec.validate, `${name} validate`).toBe('function');
    }
  });

  it('marks anything that moves money as money', () => {
    // A wrong ISBN is an inconvenience; a wrong commission rate quietly changes
    // what an author is paid on every future sale.
    for (const f of ['book.listPrice', 'book.publisherSplitPct', 'book.authorSplitPct',
                     'store.commissionPct', 'businessExpense.amount', 'tripBudget.amount']) {
      expect(WRITABLE_FIELDS[f].risk, f).toBe('money');
    }
    expect(WRITABLE_FIELDS['book.isbn'].risk).toBe('descriptive');
  });

  it('names fields the way the read tools name them', () => {
    // A model that just read `printRun` off a catalogue answer should be able
    // to write `printRun`, not have to know the record calls it something else.
    expect(WRITABLE_FIELDS['book.printRun'].key).toBe('maxPrint');
    expect(WRITABLE_FIELDS['book.publisherSplitPct'].key).toBe('pubGratuity');
    expect(WRITABLE_FIELDS['bookExpense.description'].key).toBe('desc');
  });

  it('accepts a field named bare or fully qualified', () => {
    expect(lookupField('book', 'isbn')).toBe(WRITABLE_FIELDS['book.isbn']);
    expect(lookupField('book', 'book.isbn')).toBe(WRITABLE_FIELDS['book.isbn']);
  });

  it('says what IS available when refusing a field', () => {
    const out = prepareFieldValue('book', 'nonsense', 'x', {});
    expect(out.ok).toBe(false);
    expect(out.error).toContain('isbn');
    expect(fieldsForTarget('book')).toContain('listPrice');
  });
});

describe('ISBN check digits', () => {
  it.each([
    ['978-0-306-40615-7', true], ['9780306406157', true],
    ['0306406152', true], ['0-306-40615-2', true],
    ['080442957X', true],
  ])('accepts %s', (isbn, ok) => expect(isbnCheckDigitValid(isbn)).toBe(ok));

  it.each([
    '978-0-306-40615-6',   // last digit wrong
    '9780306406175',       // two digits transposed
    '0306406153',
    '97803064061',         // too short
    'not-an-isbn',
  ])('rejects %s', (isbn) => expect(isbnCheckDigitValid(isbn)).toBe(false));

  it('leaves the app own "not set" placeholder usable', () => {
    expect(prepareFieldValue('book', 'isbn', '—', {}).ok).toBe(true);
  });
});

describe('reading a value a person or a model actually wrote', () => {
  const val = (t, f, v, ctx = {}) => prepareFieldValue(t, f, v, ctx);

  it.each([
    ['CA$1,299.00', 1299], ['40 %', 40], [' 12.50 ', 12.5], ['0', 0],
  ])('reads %s as a number', (raw, want) => {
    expect(val('book', 'listPrice', raw).value).toBe(want);
  });

  it('refuses something that is not a number at all', () => {
    expect(val('book', 'listPrice', 'about forty').ok).toBe(false);
  });

  it('holds a percentage to nought-to-a-hundred', () => {
    expect(val('book', 'publisherSplitPct', '140').error).toMatch(/above 100/);
    expect(val('store', 'commissionPct', '-5').error).toMatch(/below 0/);
  });

  it('insists a print run is whole copies', () => {
    expect(val('book', 'printRun', '120.5').error).toMatch(/whole number/);
  });

  it('takes a currency written either way round', () => {
    expect(val('book', 'currency', 'EUR').value).toBe('€');     // books store a symbol
    expect(val('bookExpense', 'currency', 'CA$').value).toBe('CAD');  // expenses store a code
    expect(val('book', 'currency', 'ZZZ').ok).toBe(false);
  });

  it('refuses a date that looks right but is not a day', () => {
    expect(val('bookExpense', 'date', '2026-02-30').error).toMatch(/not a real date/);
    expect(val('bookExpense', 'date', '14/06/2026').error).toMatch(/year-month-day/);
    expect(val('bookExpense', 'date', '2026-06-14').ok).toBe(true);
  });

  it('will not blank a title', () => {
    expect(val('book', 'title', '  ').error).toMatch(/cannot be left empty/);
  });

  it('allows a payment link to be cleared but not to be nonsense', () => {
    expect(val('book', 'paymentLink', '').ok).toBe(true);
    expect(val('book', 'paymentLink', 'paypal.me/x').ok).toBe(false);
    expect(val('book', 'paymentLink', 'https://paypal.me/x').ok).toBe(true);
    expect(val('book', 'paymentLink', 'pay@example.com').ok).toBe(true);
  });

  it('folds an old category spelling and checks it against the real list', () => {
    const ctx = { expenseCategories: ['Travel & Meals', 'Other'] };
    expect(val('businessExpense', 'category', 'travel', ctx).value).toBe('Travel & Meals');
    expect(val('businessExpense', 'category', 'Yacht Hire', ctx).ok).toBe(false);
  });
});
