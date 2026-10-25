// One to-do list across both apps, and books offered from the website:
// the pure rules (src/lib/website-todo.js, docs/website-link.md › "One to-do
// list and new books").
import { describe, it, expect } from 'vitest';
import {
  LINK_MAP_MAX,
  TODO_MAX_ITEMS,
  bookPrefill,
  buildAppTodo,
  cleanShopBook,
  cleanWebsiteTodo,
  isWebsiteHref,
  linkRequestStatus,
  parseAppRouteHash,
  plainText,
  prunableKeys,
  recentLinkRequests,
  shopBookName,
  shopBooksToOffer,
  todoSignature,
} from '../src/lib/website-todo.js';

const SITE = 'https://lyricalmyrical-web-v2.web.app';
const item = (over = {}) => ({ id: 'stock-held', count: 2, title: 'Stock for 2 books waits for your OK on the website', href: `${SITE}/admin#inventory/link`, ...over });
const shopBook = (over = {}) => ({
  key: 'hound|signed', bookId: 'hound', variantId: 'signed', title: 'The Hound', edition: 'Signed',
  author: 'Ada Lovelace', isbn: '9781234567897', price: 40, cover: 'https://firebasestorage.googleapis.com/hound.webp', status: 'published', ...over,
});

describe('the website’s to-do items', () => {
  it('keeps text-only items whose button opens the website', () => {
    const out = cleanWebsiteTodo({ todo: { at: 'x', items: [item()] } });
    expect(out).toEqual([{ id: 'stock-held', count: 2, title: 'Stock for 2 books waits for your OK on the website', href: `${SITE}/admin#inventory/link` }]);
  });

  it('drops items that would open anywhere but the website', () => {
    const out = cleanWebsiteTodo({ todo: { items: [
      item({ id: 'a', href: 'https://evil.example/admin' }),
      item({ id: 'b', href: 'javascript:alert(1)' }),
      item({ id: 'c', href: 'http://lyricalmyrical-web-v2.web.app/admin' }),
      item({ id: 'd', href: '' }),
      item({ id: 'e', href: 'https://www.lyricalmyricalbooks.com/admin#orders' }),
    ] } });
    expect(out.map(i => i.id)).toEqual(['e']);
  });

  it('is text only, one line, and at most 200 characters', () => {
    const [one] = cleanWebsiteTodo({ todo: { items: [item({ title: `<b>Bold</b>\n${'word '.repeat(80)}` })] } });
    expect(one.title).not.toMatch(/\n/);
    expect(one.title.length).toBeLessThanOrEqual(200);
    expect(one.title.startsWith('<b>Bold</b> word')).toBe(true); // shown as text, never as markup (escaped where drawn)
  });

  it('keeps at most ten, each id once, and skips broken entries', () => {
    const items = Array.from({ length: 14 }, (_, i) => item({ id: `item-${i}` }));
    items.splice(1, 0, item({ id: 'item-0' }), null, item({ id: 'bad id!' }), item({ title: '   ' , id: 'blank' }));
    const out = cleanWebsiteTodo({ todo: { items } });
    expect(out).toHaveLength(TODO_MAX_ITEMS);
    expect(new Set(out.map(i => i.id)).size).toBe(TODO_MAX_ITEMS);
    expect(out.map(i => i.id)).not.toContain('blank');
  });

  it('says nothing for a missing or malformed document', () => {
    expect(cleanWebsiteTodo(null)).toEqual([]);
    expect(cleanWebsiteTodo({})).toEqual([]);
    expect(cleanWebsiteTodo({ todo: { items: 'nope' } })).toEqual([]);
  });

  it('a count that isn’t a positive number is left out', () => {
    expect(cleanWebsiteTodo({ todo: { items: [item({ count: 'x' })] } })[0].count).toBeNull();
  });

  it('knows the website’s origins', () => {
    expect(isWebsiteHref(`${SITE}/admin#orders`)).toBe(true);
    expect(isWebsiteHref('https://lyricalmyrical-web-v2.web.app.evil.example/admin')).toBe(false);
  });
});

describe('the website’s books not in this app yet', () => {
  it('cleans one entry', () => {
    expect(cleanShopBook(shopBook())).toMatchObject({ key: 'hound|signed', title: 'The Hound', edition: 'Signed', price: 40, status: 'published' });
    expect(cleanShopBook(shopBook({ key: 'no-pipe' }))).toBeNull();
    expect(cleanShopBook(shopBook({ title: '' }))).toBeNull();
    expect(cleanShopBook(shopBook({ cover: 'http://insecure/x.jpg' })).cover).toBe('');
    expect(cleanShopBook(shopBook({ cover: 'https://x/a.jpg" onerror="x' })).cover).toBe('');
    expect(cleanShopBook(shopBook({ price: null })).price).toBeNull();
    expect(cleanShopBook(shopBook({ price: -1 })).price).toBeNull();
    expect(cleanShopBook(shopBook({ status: 'weird' })).status).toBe('published');
    expect(cleanShopBook(shopBook({ key: 'hound|', variantId: null })).key).toBe('hound|');
  });

  it('leaves out what was set aside or already asked for, and repeats', () => {
    const catalog = { books: [shopBook(), shopBook({ key: 'moth|' }), shopBook({ key: 'moth|' }), shopBook({ key: 'fern|' }), { key: 'bad' }] };
    const out = shopBooksToOffer(catalog, { dismissed: { 'fern|': '2026-10-20T00:00:00Z' }, requested: { 'hound|signed': { inventoryBookId: 'hound' } } });
    expect(out.map(b => b.key)).toEqual(['moth|']);
  });

  it('nothing before the website has sent its list', () => {
    expect(shopBooksToOffer(null)).toEqual([]);
    expect(shopBooksToOffer({ books: 'x' })).toEqual([]);
  });

  it('names a book with its edition, once', () => {
    expect(shopBookName({ title: 'The Hound', edition: 'Signed' })).toBe('The Hound — Signed');
    expect(shopBookName({ title: 'The Hound', edition: '' })).toBe('The Hound');
    expect(shopBookName({ title: 'The Hound (Signed)', edition: 'signed' })).toBe('The Hound (Signed)');
  });

  it('fills the Add new book form with name, author, ISBN and the price in CA$', () => {
    expect(bookPrefill(cleanShopBook(shopBook()))).toEqual({ title: 'The Hound — Signed', author: 'Ada Lovelace', isbn: '9781234567897', price: '40', currency: 'CA$' });
    expect(bookPrefill(cleanShopBook(shopBook({ price: null, isbn: '', author: '' })))).toEqual({ title: 'The Hound — Signed', author: '', isbn: '', price: '', currency: 'CA$' });
  });
});

describe('where an "Add to the app" stands', () => {
  const request = { inventoryBookId: 'the-hound-signed', at: '2026-10-24T10:00:00.000Z' };

  it('linked, or refused with the website’s reason and where to match it by hand', () => {
    expect(linkRequestStatus({ request, reply: { inventoryBookId: 'the-hound-signed', result: 'linked' } }).state).toBe('linked');
    const refused = linkRequestStatus({ request, reply: { inventoryBookId: 'the-hound-signed', result: 'refused', reason: 'That edition is already matched to another book.' } });
    expect(refused.state).toBe('refused');
    expect(refused.text).toBe('That edition is already matched to another book. The website’s Inventory app link page can match it by hand.');
  });

  it('ignores a reply about another book (an older request)', () => {
    expect(linkRequestStatus({ request, reply: { inventoryBookId: 'older', result: 'refused', reason: 'x' } }).state).toBe('waiting');
  });

  it('old rules: says the website will offer the match itself', () => {
    const s = linkRequestStatus({ local: { ...request, state: 'rules' } });
    expect(s).toEqual({ state: 'rules', text: 'Saved in this app. The website will offer to match it under New books to match.' });
  });

  it('not sent yet: saved here, sent when back online', () => {
    expect(linkRequestStatus({ local: { ...request, state: 'sending' } }).state).toBe('offline');
    expect(linkRequestStatus({ request, local: { ...request, state: 'sending' } }).state).toBe('waiting');
  });

  it('lists recent ones, newest first; linked ones only for three days', () => {
    const now = Date.parse('2026-10-25T12:00:00.000Z');
    const list = recentLinkRequests({
      requests: {
        'a|': { inventoryBookId: 'a', at: '2026-10-24T00:00:00.000Z' },
        'b|': { inventoryBookId: 'b', at: '2026-10-01T00:00:00.000Z' },
        'c|': { inventoryBookId: 'c', at: '2026-09-01T00:00:00.000Z' },
      },
      replies: { 'b|': { inventoryBookId: 'b', result: 'linked', at: '2026-10-02T00:00:00.000Z' } },
      local: { 'd|': { inventoryBookId: 'd', at: '2026-10-25T00:00:00.000Z', state: 'rules' } },
      now,
    });
    expect(list.map(r => [r.key, r.state])).toEqual([['d|', 'rules'], ['a|', 'waiting']]);
  });

  it('keeps the maps within the rules’ bound', () => {
    const now = Date.parse('2026-10-25T00:00:00.000Z');
    const old = { 'old|': { at: '2026-01-01T00:00:00.000Z' }, 'new|': { at: '2026-10-20T00:00:00.000Z' } };
    expect(prunableKeys(old, { now })).toEqual(['old|']);
    const full = Object.fromEntries(Array.from({ length: LINK_MAP_MAX }, (_, i) => [`k${i}|`, new Date(now - i * 1000).toISOString()]));
    const drop = prunableKeys(full, { now, keepDays: 0 });
    expect(drop).toEqual([`k${LINK_MAP_MAX - 1}|`]); // the oldest makes room for one more
  });
});

describe('this app’s to-do list for the website', () => {
  const at = '2026-10-25T12:00:00.000Z';

  it('only what the website can’t see, each opening Website orders here', () => {
    const todo = buildAppTodo({ needYou: 2, storageMissing: [{ title: 'The Hound', count: 3 }], oldStorageBooks: 1, problem: 'rules' }, at);
    expect(todo).toEqual({ at, items: [
      { id: 'needs-you', count: 2, title: '2 website orders need your decision', hash: '#website-orders' },
      { id: 'storage', count: 1, title: 'The Hound has records only in the old storage', hash: '#website-orders' },
      { id: 'old-storage', count: 1, title: '1 book is still in the inventory app’s old storage', hash: '#website-orders' },
      { id: 'link-problem', count: 1, title: 'The inventory app’s link to the website needs a look', hash: '#website-orders' },
    ] });
  });

  it('empty when nothing waits, singular and plural words', () => {
    expect(buildAppTodo({}, at)).toEqual({ at, items: [] });
    expect(buildAppTodo({ needYou: 1 }, at).items[0].title).toBe('1 website order needs your decision');
    expect(buildAppTodo({ storageMissing: [{ title: 'A', count: 1 }, { title: 'B', count: 2 }, { title: 'C', count: 0 }] }, at).items[0].title).toBe('2 books have records only in the old storage');
  });

  it('every hash and title fits what the website accepts', () => {
    const todo = buildAppTodo({ needYou: 3, storageMissing: [{ title: 'x'.repeat(400), count: 1 }], oldStorageBooks: 2, problem: 'p' }, at);
    todo.items.forEach((i) => {
      expect(i.hash).toMatch(/^#[A-Za-z0-9_=-]{1,100}$/);
      expect(i.title.length).toBeLessThanOrEqual(200);
    });
    expect(todo.items.length).toBeLessThanOrEqual(10);
  });

  it('a new time alone is not a change worth writing', () => {
    const a = buildAppTodo({ needYou: 2 }, '2026-10-25T12:00:00.000Z');
    const b = buildAppTodo({ needYou: 2 }, '2026-10-25T13:00:00.000Z');
    expect(todoSignature(a)).toBe(todoSignature(b));
    expect(todoSignature(a)).not.toBe(todoSignature(buildAppTodo({ needYou: 3 })));
    expect(todoSignature(null)).toBe('[]');
  });
});

describe('links into this app', () => {
  it('#todo and #website-orders, nothing else', () => {
    expect(parseAppRouteHash('#todo')).toBe('todo');
    expect(parseAppRouteHash('website-orders')).toBe('website-orders');
    expect(parseAppRouteHash('#website-order=ABC')).toBeNull();
    expect(parseAppRouteHash('#todos')).toBeNull();
    expect(parseAppRouteHash('')).toBeNull();
  });

  it('plain text helper cuts at a word', () => {
    expect(plainText('one two three four five', 14)).toBe('one two three…');
  });
});
