// One search box (docs/website-link.md › "One search box").
import { describe, it, expect } from 'vitest';
import { bareIsbn, cleanQuery, foldText, searchEverything } from '../src/lib/app-search.js';
import { parseBookHash, parseSearchHash, websiteBookUrl, websiteSearchUrl } from '../src/lib/app-switch.js';

const ADMIN = 'https://lyricalmyrical-web-v2.web.app/admin';
const sources = {
  admin: ADMIN,
  appBooks: [
    { id: 'hound', title: 'The Hound', author: 'Ada Lovelace', isbn: '978-1-23456-789-7' },
    { id: 'altrove', title: 'Un Fantastico Altrove', author: 'Silvia Clo Di Gregorio', isbn: '—' },
  ],
  shopBooks: [
    { key: 'hb|signed', bookId: 'hb', variantId: 'signed', title: 'The Hound', edition: 'Signed', author: 'Ada Lovelace', isbn: '9781234567897' },
    { key: 'hb|signed', bookId: 'hb', variantId: 'signed', inventoryBookId: 'hound', title: 'The Hound', edition: 'Signed', author: 'Ada Lovelace', isbn: '9781234567897' },
    { key: 'moth|', bookId: 'moth', title: 'Moth Season', author: 'Café Ré' },
  ],
  orders: [
    { orderId: 'ABCD-123456-WXYZ', number: '#ABCD-123456-WXYZ' },
    { orderId: 'ABCD-123456-WXYZ', number: '#ABCD-123456-WXYZ' },
    { orderId: 'EFGH-999999-QQQQ', number: '#EFGH-999999-QQQQ' },
  ],
};

describe('searchEverything', () => {
  it('finds nothing for an empty search, and offers no website row', () => {
    expect(searchEverything('   ', sources)).toEqual({ query: '', appBooks: [], websiteBooks: [], orders: [], websiteSearch: null });
  });

  it('finds this app’s books and the website’s, each website key once, and always ends with the website search', () => {
    const r = searchEverything('hound', sources);
    expect(r.appBooks).toEqual([{ id: 'hound', title: 'The Hound', sub: 'Ada Lovelace · ISBN 978-1-23456-789-7' }]);
    expect(r.websiteBooks).toEqual([{ key: 'hb|signed', bookId: 'hb', title: 'The Hound — Signed', sub: 'Ada Lovelace · ISBN 9781234567897', href: `${ADMIN}#catalog/book/hb` }]);
    expect(r.websiteSearch).toEqual({ text: 'hound', href: `${ADMIN}#search=hound` });
  });

  it('matches authors with accents folded, and ISBNs with or without hyphens', () => {
    expect(searchEverything('cafe', sources).websiteBooks.map(b => b.bookId)).toEqual(['moth']);
    expect(searchEverything('9781234567897', sources).appBooks.map(b => b.id)).toEqual(['hound']);
    expect(searchEverything('978-1-2345', sources).websiteBooks.map(b => b.bookId)).toEqual(['hb']);
  });

  it('finds website orders by number, with or without the #', () => {
    const r = searchEverything('#abcd-12', sources);
    expect(r.orders).toEqual([{ orderId: 'ABCD-123456-WXYZ', number: '#ABCD-123456-WXYZ', href: `${ADMIN}#orders/ABCD-123456-WXYZ` }]);
    expect(searchEverything('999999', sources).orders.map(o => o.orderId)).toEqual(['EFGH-999999-QQQQ']);
  });

  it('cleans what was typed', () => {
    expect(cleanQuery(` a\n  b ${'x'.repeat(200)}`)).toHaveLength(100);
    expect(foldText('  Café  RÉ ')).toBe('cafe re');
    expect(bareIsbn('978-1 x')).toBe('9781X');
  });
});

describe('deep links', () => {
  it('#book=<id> names one of this app’s books', () => {
    expect(parseBookHash('#book=hound')).toBe('hound');
    expect(parseBookHash('book=the-hound_2')).toBe('the-hound_2');
    expect(parseBookHash('#book=')).toBeNull();
    expect(parseBookHash('#book=a/b')).toBeNull();
    expect(parseBookHash('#book=%E0%A4%A')).toBeNull();
    expect(parseBookHash('#website-order=ABC')).toBeNull();
    expect(parseBookHash('#books=hound')).toBeNull();
  });
  it('#search=<text> is decoded, one line, at most 100 characters', () => {
    expect(parseSearchHash('#search=The%20Hound')).toBe('The Hound');
    expect(parseSearchHash('#search=%23ABCD-1')).toBe('#ABCD-1');
    expect(parseSearchHash('#search=a%0Ab')).toBe('a b');
    expect(parseSearchHash(`#search=${'x'.repeat(150)}`)).toHaveLength(100);
    expect(parseSearchHash('#search=%20')).toBeNull();
    expect(parseSearchHash('#search=%E0%A4%A')).toBeNull();
    expect(parseSearchHash('#todo')).toBeNull();
  });
  it('builds the website admin’s book and search links', () => {
    expect(websiteBookUrl('bk 1', ADMIN)).toBe(`${ADMIN}#catalog/book/bk%201`);
    expect(websiteSearchUrl('The Hound', ADMIN)).toBe(`${ADMIN}#search=The%20Hound`);
    expect(websiteSearchUrl('', ADMIN)).toBe(ADMIN);
  });
});
