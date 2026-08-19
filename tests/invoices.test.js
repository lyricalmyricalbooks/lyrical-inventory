import { describe, it, expect } from 'vitest';
import {
  booksNamedInText,
  deriveInvoiceBookIds,
  invoiceBookIds,
  invoiceCoversBook,
  invoicesForBook,
  findInvoiceAcrossBooks,
  otherBookTitles,
} from '../src/lib/invoices.js';

// The reported bug: an invoice billing two titles was only reachable from the
// one that happened to be open when it was written. Switch to the other title
// on the very same invoice and it had vanished.
const BOOKS = [
  { id: 'altrove', title: 'Un Fantastico Altrove' },
  { id: 'hound', title: 'The Hound' },
  { id: 'other', title: 'Nightjar' },
];

// The two lines from the reported invoice, typed by hand.
const twoTitleInvoice = (over = {}) => ({
  id: 'inv-1', num: 'INV-ALTROV-2026-004', storeName: 'Casa Bosques',
  items: [
    { description: 'Un Fantastico Altrove (40% Wholesale discount = $36 per book)', qty: 3, unitPrice: 60 },
    { description: 'The Hound ( Production cost wholesale discount =$52 per book)', qty: 4, unitPrice: 65 },
  ],
  ...over,
});

describe('booksNamedInText', () => {
  it('finds the title a hand-typed line item names', () => {
    expect(booksNamedInText('The Hound ( Production cost wholesale discount =$52 per book)', BOOKS)).toEqual(['hound']);
  });

  it('is case- and punctuation-tolerant around the title', () => {
    expect(booksNamedInText('4x THE HOUND — restock', BOOKS)).toEqual(['hound']);
  });

  it('matches the longest title so a sequel does not also count as the original', () => {
    const shelf = [{ id: 'hound', title: 'The Hound' }, { id: 'hound2', title: 'The Hound II' }];
    expect(booksNamedInText('The Hound II — second printing', shelf)).toEqual(['hound2']);
  });

  it('returns nothing for a line that names no title', () => {
    expect(booksNamedInText('Shipping and handling', BOOKS)).toEqual([]);
    expect(booksNamedInText('', BOOKS)).toEqual([]);
  });
});

describe('deriveInvoiceBookIds', () => {
  it('covers both titles on a two-title invoice', () => {
    const ids = deriveInvoiceBookIds(twoTitleInvoice(), 'altrove', BOOKS);
    expect(ids).toContain('altrove');
    expect(ids).toContain('hound');
    expect(ids).not.toContain('other');
  });

  it('prefers a line stamped with its book over reading the description', () => {
    // Imported lines carry bookId outright, so a description that spells the
    // title differently cannot drop the book off the invoice.
    const inv = { items: [{ description: 'consignment sale · Sept 2026', bookId: 'hound' }] };
    expect(deriveInvoiceBookIds(inv, 'altrove', BOOKS)).toEqual(['altrove', 'hound']);
  });

  it('always keeps the owning book, even when no line names a title', () => {
    const inv = { items: [{ description: 'Restock — 6 copies' }] };
    expect(deriveInvoiceBookIds(inv, 'altrove', BOOKS)).toEqual(['altrove']);
  });

  it('does not repeat a title named on several lines', () => {
    const inv = { items: [{ description: 'The Hound — May' }, { description: 'The Hound — June' }] };
    expect(deriveInvoiceBookIds(inv, 'hound', BOOKS)).toEqual(['hound']);
  });
});

describe('invoiceBookIds', () => {
  it('uses the span saved on the invoice when there is one', () => {
    const inv = twoTitleInvoice({ bookIds: ['altrove', 'hound'] });
    expect(invoiceBookIds(inv, 'altrove', BOOKS)).toEqual(['altrove', 'hound']);
  });

  it('derives the span for an invoice saved before it was recorded', () => {
    // The already-sent invoices in the reported case have no bookIds at all —
    // they must still surface under both titles without being re-saved.
    expect(invoiceBookIds(twoTitleInvoice(), 'altrove', BOOKS)).toContain('hound');
  });

  it('keeps the owning book even if a stored span somehow omits it', () => {
    const inv = twoTitleInvoice({ bookIds: ['hound'] });
    expect(invoiceBookIds(inv, 'altrove', BOOKS)).toContain('altrove');
  });
});

describe('invoicesForBook', () => {
  // The invoice is physically stored under Altrove only.
  const states = () => ({
    altrove: { invoices: [twoTitleInvoice()] },
    hound: { invoices: [{ id: 'inv-2', num: 'INV-HOUND-2026-001', items: [{ description: 'The Hound — restock' }] }] },
    other: { invoices: [] },
  });

  it('shows the two-title invoice from the title that stores it', () => {
    const rows = invoicesForBook(states(), BOOKS, 'altrove');
    expect(rows.map(r => r.inv.id)).toEqual(['inv-1']);
    expect(rows[0].shared).toBe(false);
  });

  it('also shows it from the other title it bills — the reported bug', () => {
    const rows = invoicesForBook(states(), BOOKS, 'hound');
    const ids = rows.map(r => r.inv.id);
    expect(ids).toContain('inv-1');   // stored under Altrove, billed to Hound too
    expect(ids).toContain('inv-2');   // Hound's own
    expect(rows.find(r => r.inv.id === 'inv-1').shared).toBe(true);
    expect(rows.find(r => r.inv.id === 'inv-2').shared).toBe(false);
  });

  it('does not leak an invoice into a title it never bills', () => {
    expect(invoicesForBook(states(), BOOKS, 'other')).toEqual([]);
  });

  it('skips books the caller excludes, such as test books', () => {
    const withTest = { ...states(), testbook: { invoices: [twoTitleInvoice({ id: 'inv-test' })] } };
    const ids = invoicesForBook(withTest, BOOKS, 'hound', bid => bid === 'testbook').map(r => r.inv.id);
    expect(ids).not.toContain('inv-test');
  });

  it('tolerates a book whose state has no invoices yet', () => {
    expect(() => invoicesForBook({ altrove: {} }, BOOKS, 'altrove')).not.toThrow();
  });
});

describe('findInvoiceAcrossBooks', () => {
  const states = {
    altrove: { invoices: [twoTitleInvoice()] },
    hound: { invoices: [{ id: 'inv-2', num: 'INV-HOUND-2026-001' }] },
  };

  it('locates an invoice held by another book, with the book that holds it', () => {
    const hit = findInvoiceAcrossBooks(states, 'inv-1', 'hound');
    expect(hit.ownerBookId).toBe('altrove');
    expect(hit.inv.num).toBe('INV-ALTROV-2026-004');
  });

  it('prefers the caller’s own book when the id exists in both', () => {
    const dup = { altrove: { invoices: [{ id: 'dup', num: 'A' }] }, hound: { invoices: [{ id: 'dup', num: 'B' }] } };
    expect(findInvoiceAcrossBooks(dup, 'dup', 'hound').inv.num).toBe('B');
    expect(findInvoiceAcrossBooks(dup, 'dup', 'altrove').inv.num).toBe('A');
  });

  it('returns null for an unknown id', () => {
    expect(findInvoiceAcrossBooks(states, 'nope')).toBeNull();
    expect(findInvoiceAcrossBooks(null, 'inv-1')).toBeNull();
  });
});

describe('otherBookTitles', () => {
  it('names the other titles on the invoice for the list badge', () => {
    expect(otherBookTitles(twoTitleInvoice(), 'altrove', 'hound', BOOKS)).toEqual(['Un Fantastico Altrove']);
  });

  it('is empty for a single-title invoice', () => {
    const inv = { items: [{ description: 'The Hound — restock' }] };
    expect(otherBookTitles(inv, 'hound', 'hound', BOOKS)).toEqual([]);
  });
});

describe('invoiceCoversBook', () => {
  it('answers for both titles of a two-title invoice', () => {
    const inv = twoTitleInvoice();
    expect(invoiceCoversBook(inv, 'altrove', 'hound', BOOKS)).toBe(true);
    expect(invoiceCoversBook(inv, 'altrove', 'altrove', BOOKS)).toBe(true);
    expect(invoiceCoversBook(inv, 'altrove', 'other', BOOKS)).toBe(false);
  });
});
