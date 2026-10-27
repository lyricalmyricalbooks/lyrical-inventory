// One search box: this app's books, and what the app already knows about the
// shop's website — its books (websiteLink/catalog.books and .linked) and the
// website orders the app holds — each opening where it lives. The last row is
// always "Search the website for “…”" (docs/website-link.md › "One search box").
//
// Pure and tested (tests/app-search.test.js). The search window is
// src/features/app-search.js.
import { websiteBookUrl, websiteOrderUrl, websiteSearchUrl, SEARCH_TEXT_MAX } from './app-switch.js';

export const SEARCH_LIMITS = Object.freeze({ appBooks: 8, websiteBooks: 8, orders: 6 });

const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Lower case, accents folded, one space between words. */
export function foldText(value) {
  return clean(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** An ISBN (or a typed one) reduced to its digits and X. */
export function bareIsbn(value) {
  return String(value ?? '').replace(/[^0-9xX]/g, '').toUpperCase();
}

/** The typed text, one line, at most SEARCH_TEXT_MAX characters. */
export function cleanQuery(value) {
  return clean(value).slice(0, SEARCH_TEXT_MAX).trim();
}

// 0 = the field starts with the text, 1 = a word in it does, 2 = it contains it, -1 = no match.
function rank(fieldText, q) {
  const f = foldText(fieldText);
  if (!f || !q) return -1;
  if (f.startsWith(q)) return 0;
  if (f.includes(` ${q}`)) return 1;
  return f.includes(q) ? 2 : -1;
}

function bookRank(book, q, isbnQ) {
  const scores = [rank(book.title, q), rank(book.author, q)].filter(s => s >= 0);
  if (isbnQ.length >= 4 && bareIsbn(book.isbn).includes(isbnQ)) scores.push(0);
  return scores.length ? Math.min(...scores) : -1;
}

function byRank(a, b) {
  return a.rank - b.rank || a.title.localeCompare(b.title);
}

function sub(parts) {
  return parts.map(clean).filter(Boolean).join(' · ');
}

/**
 * The results for `query`:
 *  - appBooks      [{ id, title, sub }]                    this app's books
 *  - websiteBooks  [{ key, bookId, title, sub, href }]     website books, each key once
 *  - orders        [{ orderId, number, href }]             website orders the app holds
 *  - websiteSearch { text, href } | null                   always, once something is typed
 */
export function searchEverything(query, { appBooks = [], shopBooks = [], orders = [], admin } = {}) {
  const text = cleanQuery(query);
  const q = foldText(text);
  const empty = { query: text, appBooks: [], websiteBooks: [], orders: [], websiteSearch: null };
  if (!q) return empty;
  const isbnQ = /\d/.test(text) ? bareIsbn(text) : '';

  const mine = (Array.isArray(appBooks) ? appBooks : [])
    .filter(b => b && b.id)
    .map(b => ({ id: String(b.id), title: clean(b.title) || String(b.id), author: b.author, isbn: b.isbn }))
    .map(b => ({ ...b, rank: bookRank(b, q, isbnQ) }))
    .filter(b => b.rank >= 0)
    .sort(byRank)
    .slice(0, SEARCH_LIMITS.appBooks)
    .map(b => ({ id: b.id, title: b.title, sub: sub([b.author, bareIsbn(b.isbn) ? `ISBN ${clean(b.isbn)}` : '']) }));

  const seen = new Set();
  const theirs = [];
  (Array.isArray(shopBooks) ? shopBooks : []).forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const bookId = clean(raw.bookId) || clean(raw.key).split('|')[0];
    const key = clean(raw.key) || `${bookId}|${clean(raw.variantId)}`;
    if (!bookId || seen.has(key)) return;
    seen.add(key);
    const title = clean(raw.title);
    if (!title) return;
    const book = { title, author: raw.author, isbn: raw.isbn };
    const r = bookRank(book, q, isbnQ);
    if (r < 0) return;
    const edition = clean(raw.edition);
    const named = edition && !title.toLowerCase().includes(edition.toLowerCase()) ? `${title} — ${edition}` : title;
    theirs.push({ key, bookId, title: named, rank: r, sub: sub([raw.author, clean(raw.isbn) ? `ISBN ${clean(raw.isbn)}` : '']) });
  });
  const websiteBooks = theirs.sort(byRank).slice(0, SEARCH_LIMITS.websiteBooks)
    .map(({ key, bookId, title, sub: s }) => ({ key, bookId, title, sub: s, href: websiteBookUrl(bookId, admin) }));

  const numQ = q.replace(/^#/, '').replace(/\s+/g, '');
  const seenOrders = new Set();
  const found = [];
  if (numQ.length >= 2) {
    (Array.isArray(orders) ? orders : []).forEach((o) => {
      const orderId = clean(o && o.orderId);
      if (!orderId || seenOrders.has(orderId)) return;
      const number = clean(o.number) || orderId;
      const bare = foldText(number).replace(/^#/, '').replace(/\s+/g, '');
      const id = foldText(orderId);
      const r = bare.startsWith(numQ) || id.startsWith(numQ) ? 0 : (bare.includes(numQ) || id.includes(numQ) ? 2 : -1);
      if (r < 0) return;
      seenOrders.add(orderId);
      found.push({ orderId, number, rank: r, title: number });
    });
  }
  const ordersOut = found.sort(byRank).slice(0, SEARCH_LIMITS.orders)
    .map(({ orderId, number }) => ({ orderId, number, href: websiteOrderUrl(orderId, admin) }));

  return {
    query: text,
    appBooks: mine,
    websiteBooks,
    orders: ordersOut,
    websiteSearch: { text, href: websiteSearchUrl(text, admin) },
  };
}
