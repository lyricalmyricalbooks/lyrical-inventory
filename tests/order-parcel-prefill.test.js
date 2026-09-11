import { describe, expect, it } from 'vitest';
import {
  orderParcelPlan,
  parcelLinesFromLedgerEntry,
  describeParcelPlan,
} from '../src/lib/order-parcel-prefill.js';

const BOOKS = {
  altrove: {
    id: 'altrove', title: 'Altrove', listPrice: 32.5,
    shipWeight: 1.2, shipWeightUnit: 'lb',
  },
  hound: {
    id: 'hound', title: 'The Hound', listPrice: 40,
    shipWeight: 24, shipWeightUnit: 'oz',
  },
  feather: { id: 'feather', title: 'Feather', listPrice: 18 },
};

const line = (bookId, qty, extra = {}) => ({
  title: BOOKS[bookId]?.title || 'Mystery item',
  bookId,
  qty,
  unitPrice: null,
  confidence: 'exact',
  ...extra,
});

describe('orderParcelPlan', () => {
  it('reads a single-title order as a fully automatic parcel', () => {
    const plan = orderParcelPlan([line('altrove', 3, { unitPrice: 30 })], BOOKS);
    expect(plan).toMatchObject({
      presetBookId: 'altrove',
      presetTitle: 'Altrove',
      totalQty: 3,
      matchedQty: 3,
      distinctBooks: 1,
      confidence: 'exact',
      autoSafe: true,
    });
    expect(plan.unmatchedTitles).toEqual([]);
  });

  it('sizes the box on the book with the most copies', () => {
    const plan = orderParcelPlan([line('altrove', 1), line('hound', 4)], BOOKS);
    expect(plan.presetBookId).toBe('hound');
    expect(plan.totalQty).toBe(5);
    expect(plan.distinctBooks).toBe(2);
    expect(plan.confidence).toBe('mixed');
  });

  it('breaks an equal-copy tie on the heavier book, so postage is never understated', () => {
    // Altrove is 1.2 lb; The Hound is 24 oz = 1.5 lb.
    const plan = orderParcelPlan([line('altrove', 2), line('hound', 2)], BOOKS);
    expect(plan.presetBookId).toBe('hound');
  });

  it('never acts unattended on a box holding two different titles', () => {
    // One ledger row per order means a two-title order would deduct both
    // copies from whichever book sized the box.
    const plan = orderParcelPlan([line('altrove', 1), line('feather', 1)], BOOKS);
    expect(plan.confidence).toBe('mixed');
    expect(plan.autoSafe).toBe(false);
  });

  it('counts an uncatalogued item toward the parcel but drops confidence to partial', () => {
    const plan = orderParcelPlan([line('altrove', 2), line('', 1, { title: 'Enamel pin' })], BOOKS);
    expect(plan.presetBookId).toBe('altrove');
    expect(plan.totalQty).toBe(3);
    expect(plan.matchedQty).toBe(2);
    expect(plan.unmatchedTitles).toEqual(['Enamel pin']);
    expect(plan.confidence).toBe('partial');
    expect(plan.autoSafe).toBe(false);
  });

  it('never records stock from a book deduced out of the amount paid', () => {
    const plan = orderParcelPlan([line('altrove', 2, { confidence: 'price' })], BOOKS);
    expect(plan.presetBookId).toBe('altrove');
    expect(plan.confidence).toBe('partial');
    expect(plan.autoSafe).toBe(false);
  });

  it('returns nothing to propose when no line ties to the catalogue', () => {
    const plan = orderParcelPlan([line('', 2, { title: 'Tote bag' })], BOOKS);
    expect(plan.presetBookId).toBe('');
    expect(plan.confidence).toBe('none');
    expect(plan.autoSafe).toBe(false);
    expect(plan.unmatchedTitles).toEqual(['Tote bag']);
  });

  it('ignores lines with no copies in them', () => {
    const plan = orderParcelPlan([line('altrove', 0), line('hound', 2)], BOOKS);
    expect(plan.totalQty).toBe(2);
    expect(plan.presetBookId).toBe('hound');
  });

  it('survives junk input rather than throwing at the publisher', () => {
    expect(orderParcelPlan(null, BOOKS).confidence).toBe('none');
    expect(orderParcelPlan([null, undefined], BOOKS).confidence).toBe('none');
    expect(orderParcelPlan([line('altrove', 1)], null).confidence).toBe('none');
  });

  it('declares what the buyer paid, not the list price', () => {
    const plan = orderParcelPlan([line('altrove', 1, { unitPrice: 27.99 })], BOOKS);
    expect(plan.customsUnitValue).toBe(27.99);
  });

  it('falls back to the list price when the order carries no unit price', () => {
    expect(orderParcelPlan([line('altrove', 1)], BOOKS).customsUnitValue).toBe(32.5);
  });

  it('prefers a customs value saved on the book over its list price', () => {
    const books = { ...BOOKS, altrove: { ...BOOKS.altrove, shipCustomsVal: 12 } };
    expect(orderParcelPlan([line('altrove', 1)], books).customsUnitValue).toBe(12);
  });

  it('falls back to a generic declared value when the book is priced at zero', () => {
    const books = { blank: { id: 'blank', title: 'Blank', listPrice: 0 } };
    expect(orderParcelPlan([line('blank', 1)], books).customsUnitValue).toBe(25);
  });

  it('builds a customs description from the book title', () => {
    expect(orderParcelPlan([line('altrove', 1)], BOOKS).customsDescription)
      .toBe('Altrove - printed books');
  });

  it('prefers a customs description saved on the book', () => {
    const books = { ...BOOKS, altrove: { ...BOOKS.altrove, shipCustomsDesc: 'Poetry paperback' } };
    expect(orderParcelPlan([line('altrove', 1)], books).customsDescription).toBe('Poetry paperback');
  });
});

describe('parcelLinesFromLedgerEntry', () => {
  it('turns a history row into one parcel line', () => {
    const lines = parcelLinesFromLedgerEntry({ qty: 2, price: 29 }, 'altrove', BOOKS);
    expect(lines).toEqual([
      { title: 'Altrove', bookId: 'altrove', qty: 2, unitPrice: 29, confidence: 'exact' },
    ]);
  });

  it('defaults a missing quantity to a single copy', () => {
    expect(parcelLinesFromLedgerEntry({ price: 29 }, 'altrove', BOOKS)[0].qty).toBe(1);
  });

  it('reads the book off the entry when the caller does not name one', () => {
    expect(parcelLinesFromLedgerEntry({ _bookId: 'hound', qty: 1 }, '', BOOKS)[0].bookId).toBe('hound');
  });

  it('proposes nothing for a book that is no longer in the catalogue', () => {
    expect(parcelLinesFromLedgerEntry({ qty: 1 }, 'deleted-book', BOOKS)).toEqual([]);
  });
});

describe('describeParcelPlan', () => {
  it('says plainly what is in the box', () => {
    expect(describeParcelPlan(orderParcelPlan([line('altrove', 1)], BOOKS)))
      .toBe('1 copy of Altrove');
    expect(describeParcelPlan(orderParcelPlan([line('altrove', 3)], BOOKS)))
      .toBe('3 copies of Altrove');
  });

  it('asks for a weight check when the box holds more than one title', () => {
    const text = describeParcelPlan(orderParcelPlan([line('altrove', 1), line('hound', 1)], BOOKS));
    expect(text).toContain('2 titles');
    expect(text).toContain('check the weight');
  });

  it('names the item it could not place', () => {
    const text = describeParcelPlan(orderParcelPlan([line('altrove', 1), line('', 1, { title: 'Tote' })], BOOKS));
    expect(text).toContain('Tote');
    expect(text).toContain('check the weight');
  });

  it('flags a price-deduced book as a guess', () => {
    const text = describeParcelPlan(orderParcelPlan([line('altrove', 2, { confidence: 'price' })], BOOKS));
    expect(text).toContain('best guess');
  });

  it('says nothing when there is no parcel to describe', () => {
    expect(describeParcelPlan(orderParcelPlan([], BOOKS))).toBe('');
  });
});
