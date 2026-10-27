// Book details that differ (docs/website-link.md › "Book details in step, and one search").
// docs/link-details-fixture.json is the same file in the website's repo; both test suites check it.
import { describe, it, expect } from 'vitest';
import fixture from '../docs/link-details-fixture.json';
import {
  appBooksForDetails, detailCompareWords, detailDifferences, detailPatchForApp, detailSignature,
  detailValue, isCanadian, openDifferences, pruneKept,
} from '../src/lib/link-details.js';


describe('detailDifferences', () => {
  it('matches the shared fixture exactly', () => {
    expect(detailDifferences(fixture.input.linked, fixture.input.appBooks)).toEqual(fixture.expected);
  });

  it('compares price for every way of writing Canadian dollars, and only those', () => {
    for (const cur of ['', 'CAD', 'cad', 'CA$', 'ca$', 'C$', '$', ' CA$ ']) expect(isCanadian(cur)).toBe(true);
    for (const cur of ['€', 'EUR', 'US$', 'USD', 'MX$']) expect(isCanadian(cur)).toBe(false);
    const linked = [{ key: 'b|', bookId: 'b', variantId: null, inventoryBookId: 'hound', title: 'The Hound', author: '', isbn: '', price: 45, sharedWith: 1 }];
    const book = (currency) => [{ id: 'hound', title: 'The Hound', author: '', isbn: '', price: 65, currency }];
    expect(detailDifferences(linked, book('CA$')).map(d => d.field)).toEqual(['price']);
    expect(detailDifferences(linked, book('€'))).toEqual([]);
  });

  it('tidies values before comparing', () => {
    expect(detailValue('title', '  A   B ')).toBe('A B');
    expect(detailValue('isbn', '978-1 234x')).toBe('9781234X');
    expect(detailValue('isbn', '—')).toBe('');
    expect(detailValue('price', 40)).toBe('40.00');
    expect(detailValue('price', 0)).toBe('');
    expect(detailValue('price', null)).toBe('');
  });

  it('keeps at most 100, and survives junk', () => {
    const linked = Array.from({ length: 150 }, (_, i) => ({ bookId: `b${i}`, inventoryBookId: `i${i}`, title: `T${i}`, sharedWith: 1 }));
    const app = linked.map(r => ({ id: r.inventoryBookId, title: 'other', currency: 'CAD' }));
    expect(detailDifferences(linked, app)).toHaveLength(100);
    expect(detailDifferences(null, null)).toEqual([]);
    expect(detailDifferences([null, {}, { inventoryBookId: 'x' }], [{ id: 'x' }])).toEqual([]);
  });
});

describe('Leave as is', () => {
  const [d] = fixture.expected;
  it('holds until either value changes', () => {
    const kept = { [d.id]: detailSignature(d) };
    expect(detailSignature(d)).toBe(JSON.stringify([d.shop, d.app]));
    expect(openDifferences([d], kept)).toEqual([]);
    expect(openDifferences([{ ...d, app: 'Night Songs (3rd ed.)' }], kept)).toHaveLength(1);
    expect(openDifferences([d], null)).toEqual([d]);
  });
  it('leaves kept choices out before the list is cut to 100', () => {
    const linked = Array.from({ length: 150 }, (_, i) => ({ bookId: `b${i}`, inventoryBookId: `i${String(i).padStart(3, '0')}`, title: `T${String(i).padStart(3, '0')}`, sharedWith: 2 }));
    const app = linked.map(r => ({ id: r.inventoryBookId, title: 'other', currency: 'CAD' }));
    const all = detailDifferences(linked, app);
    const kept = Object.fromEntries(all.slice(0, 60).map(d => [d.id, detailSignature(d)]));
    const shown = detailDifferences(linked, app, kept);
    expect(shown).toHaveLength(90);
    expect(shown[0].title).toBe('T060');
    expect(detailDifferences(fixture.input.linked, fixture.input.appBooks, { 'inv-a|price': JSON.stringify(['30.00', '32.00']) }))
      .toEqual(fixture.expected.filter(d => d.id !== 'inv-a|price'));
    expect(detailDifferences(fixture.input.linked, fixture.input.appBooks, { 'inv-a|price': JSON.stringify(['30.00', '31.00']) }))
      .toEqual(fixture.expected);
  });
  it('remembers at most the newest choices', () => {
    const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`id${i}`, 'sig']));
    expect(Object.keys(pruneKept(many, 3))).toEqual(['id2', 'id3', 'id4']);
    expect(pruneKept({ a: 1, b: 'x' })).toEqual({ b: 'x' });
  });
});

describe('the app’s side', () => {
  it('reads its books as the website reads settings/catalog', () => {
    expect(appBooksForDetails([
      { id: 'hound', title: ' The Hound ', author: 'A', isbn: '—', listPrice: 65, currency: 'CA$', maxPrint: 300 },
      { id: 'zero', title: '', listPrice: 0 },
      null,
    ])).toEqual([
      { id: 'hound', title: 'The Hound', author: 'A', isbn: '', price: 65, currency: 'CA$' },
      { id: 'zero', title: 'zero', author: '', isbn: '', price: null, currency: '' },
    ]);
  });
  it('copies only a value the website has, price into the list price', () => {
    expect(detailPatchForApp({ field: 'title', shop: 'X', app: 'Y' })).toEqual({ title: 'X' });
    expect(detailPatchForApp({ field: 'author', shop: 'A', app: '' })).toEqual({ author: 'A' });
    expect(detailPatchForApp({ field: 'isbn', shop: '1234567890', app: '' })).toEqual({ isbn: '1234567890' });
    expect(detailPatchForApp({ field: 'price', shop: '30.00', app: '32.00' })).toEqual({ listPrice: 30 });
    expect(detailPatchForApp({ field: 'isbn', shop: '', app: '123' })).toBeNull();
  });
  it('says the two values in plain words', () => {
    expect(detailCompareWords({ field: 'price', shop: '30.00', app: '32.00' })).toBe('Website: CA$30.00 · This app: CA$32.00');
    expect(detailCompareWords({ field: 'isbn', shop: '1234567890', app: '' })).toBe('Website: 1234567890 · This app: nothing');
  });
});
