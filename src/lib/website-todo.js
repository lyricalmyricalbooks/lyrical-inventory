// One to-do list across both apps, and books offered from the website.
//
// The shop's website and this app each list what waits on the owner in the
// other one (docs/website-link.md › "One to-do list and new books"):
//
//  - the website writes `websiteLink/website.todo` — things only it can see
//    (stock waiting for an OK, new books to match…). This app shows each one on
//    its To-do list with a button that opens the website there.
//  - this app writes `websiteLink/app.todo` — things only it can see (website
//    orders waiting for a decision under Needs you, storage problems). The
//    website shows them as admin alerts.
//  - the website lists, in `websiteLink/catalog`, printed editions it sells
//    that aren't in this app yet. This app offers each one with "Add to the
//    app" (its own Add new book form, filled in) or "Not a book for the app".
//
// Everything here is pure and tested (tests/website-todo.test.js). The wiring
// — reading and writing the documents, the card section, the To-do rows — is
// src/features/website-link.js.
import { WEBSITE_ORIGINS, originOf } from './app-switch.js';

export const TODO_MAX_ITEMS = 10;
export const TODO_TITLE_MAX = 200;
export const CATALOG_MAX_BOOKS = 200;
/** The contract allows at most this many keys in linkRequests / dismissedShopBooks (firestore.rules). */
export const LINK_MAP_MAX = 300;
/** Link requests older than this are dropped when a new one is written (the website keeps replies 30 days). */
export const LINK_REQUEST_KEEP_DAYS = 60;

/** Where the app's own to-do items take the website's owner: always the Website orders tab. */
export const WEBSITE_ORDERS_HASH = '#website-orders';
export const TODO_HASH = '#todo';

const DAY = 24 * 60 * 60 * 1000;
const clean = (v) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
// A website book key: "<bookId>|<variantId or ''>". Firestore ids never hold "/".
const KEY = /^[^/|\s][^/|]{0,149}\|[^/|]{0,150}$/;

/** Text only, one line, at most `max` characters (cut at a word when it can). */
export function plainText(value, max = TODO_TITLE_MAX) {
  const text = clean(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** True when `href` is an https address on one of the website's own origins. */
export function isWebsiteHref(href, origins = WEBSITE_ORIGINS) {
  const s = String(href || '').trim();
  if (!/^https:\/\//i.test(s)) return false;
  const origin = originOf(s);
  return !!origin && origins.includes(origin);
}

/**
 * The website's to-do items, ready to show: at most ten, text only, and only
 * those whose button would open the website itself. Anything else is dropped,
 * never shown half-working.
 */
export function cleanWebsiteTodo(doc, { origins = WEBSITE_ORIGINS } = {}) {
  const items = doc && doc.todo && Array.isArray(doc.todo.items) ? doc.todo.items : [];
  const out = [];
  const seen = new Set();
  for (const raw of items) {
    if (out.length >= TODO_MAX_ITEMS) break;
    if (!raw || typeof raw !== 'object') continue;
    const id = clean(raw.id);
    const title = plainText(raw.title);
    const href = String(raw.href || '').trim();
    if (!ID.test(id) || seen.has(id) || !title || !isWebsiteHref(href, origins)) continue;
    const n = Math.floor(Number(raw.count));
    seen.add(id);
    out.push({ id, title, href, count: Number.isFinite(n) && n > 0 ? n : null });
  }
  return out;
}

function isKey(key) {
  return typeof key === 'string' && KEY.test(key);
}

function httpsOrEmpty(url) {
  const s = String(url || '').trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

/** One catalog entry from the website, cleaned, or null when it can't be offered. */
export function cleanShopBook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = String(raw.key || '').trim();
  const title = plainText(raw.title, 200);
  if (!isKey(key) || !title) return null;
  const price = raw.price == null || raw.price === '' ? null : Number(raw.price);
  const status = ['published', 'draft', 'scheduled'].includes(raw.status) ? raw.status : 'published';
  return {
    key,
    bookId: clean(raw.bookId) || key.split('|')[0],
    variantId: raw.variantId ? clean(raw.variantId) : null,
    title,
    edition: plainText(raw.edition, 80),
    author: plainText(raw.author, 120),
    isbn: plainText(raw.isbn, 40),
    price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : null,
    cover: httpsOrEmpty(raw.cover),
    status,
  };
}

/**
 * The website's books to offer here: the catalog, minus what the owner set
 * aside (`dismissed`), what this app already asked the website to link
 * (`requested`), and anything with no usable key or title. Same order as the
 * website sent, each key once.
 */
export function shopBooksToOffer(catalog, { dismissed = {}, requested = {} } = {}) {
  const books = catalog && Array.isArray(catalog.books) ? catalog.books.slice(0, CATALOG_MAX_BOOKS) : [];
  const skip = (key) => Object.prototype.hasOwnProperty.call(dismissed || {}, key)
    || Object.prototype.hasOwnProperty.call(requested || {}, key);
  const out = [];
  const seen = new Set();
  books.forEach((raw) => {
    const b = cleanShopBook(raw);
    if (!b || seen.has(b.key) || skip(b.key)) return;
    seen.add(b.key);
    out.push(b);
  });
  return out;
}

/** "The Hound — Signed", or the title alone when the edition is empty or already in it. */
export function shopBookName(book) {
  const title = clean(book && book.title);
  const edition = clean(book && book.edition);
  if (!edition || title.toLowerCase().includes(edition.toLowerCase())) return title;
  return `${title} — ${edition}`;
}

/**
 * What the Add new book form starts with for a website book: its name, author,
 * ISBN and regular price in CA$. The print run and everything else are left
 * for the owner, who checks it all and saves.
 */
export function bookPrefill(book) {
  const price = book && Number.isFinite(book.price) && book.price >= 0 ? book.price : null;
  return {
    title: shopBookName(book),
    author: clean(book && book.author),
    isbn: clean(book && book.isbn),
    price: price == null ? '' : String(price),
    currency: 'CA$',
  };
}

function ms(at) {
  const t = Date.parse(String(at || ''));
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Where one "Add to the app" stands, for the line under it:
 *  - 'linked'   the website linked the edition to the new book;
 *  - 'refused'  the website couldn't (its reason, said plainly);
 *  - 'rules'    this app isn't allowed to ask yet (rules not deployed): the
 *               website will offer the match under New books to match;
 *  - 'offline'  saved here, sent once back online;
 *  - 'waiting'  sent, the website's next check answers.
 * A reply for another inventory book (an older request) is ignored.
 */
export function linkRequestStatus({ request = null, reply = null, local = null } = {}) {
  const bookId = (request && request.inventoryBookId) || (local && local.inventoryBookId) || '';
  if (reply && reply.inventoryBookId && reply.inventoryBookId === bookId) {
    if (reply.result === 'linked') return { state: 'linked', text: 'Linked on the website' };
    if (reply.result === 'refused') {
      const why = plainText(reply.reason, 300) || 'The website couldn’t link it.';
      return { state: 'refused', text: `${why} The website’s Inventory app link page can match it by hand.` };
    }
  }
  if (local && local.state === 'rules') {
    return { state: 'rules', text: 'Saved in this app. The website will offer to match it under New books to match.' };
  }
  if (!request && local && local.state !== 'sent') {
    return { state: 'offline', text: 'Saved in this app. It’s sent to the website once you’re back online.' };
  }
  return { state: 'waiting', text: 'Sent to the website. Its next check links the two, usually within a few minutes.' };
}

/**
 * The link requests to list under "Added from the website": the server's and
 * this device's, newest first, linked ones for three days after the answer and
 * the rest for 30 days, at most ten.
 */
export function recentLinkRequests({ requests = {}, replies = {}, local = {}, now = Date.now() } = {}) {
  const keys = new Set([...Object.keys(requests || {}), ...Object.keys(local || {})]);
  const out = [];
  keys.forEach((key) => {
    if (!isKey(key)) return;
    const request = requests && requests[key] && typeof requests[key] === 'object' ? requests[key] : null;
    const mine = local && local[key] && typeof local[key] === 'object' ? local[key] : null;
    const reply = replies && replies[key] && typeof replies[key] === 'object' ? replies[key] : null;
    const status = linkRequestStatus({ request, reply, local: mine });
    const at = ms((request && request.at) || (mine && mine.at));
    if (!Number.isFinite(at)) return;
    const since = status.state === 'linked' ? ms(reply && reply.at) || at : at;
    if (now - since > (status.state === 'linked' ? 3 : 30) * DAY) return;
    out.push({ key, inventoryBookId: (request && request.inventoryBookId) || (mine && mine.inventoryBookId) || '', at, ...status });
  });
  return out.sort((a, b) => b.at - a.at).slice(0, TODO_MAX_ITEMS);
}

/**
 * Old link requests to drop when a new one is written, so the map stays
 * within the rules' bound: anything older than LINK_REQUEST_KEEP_DAYS, then the
 * oldest, until there is room for the new one.
 */
export function prunableKeys(map = {}, { now = Date.now(), keepDays = LINK_REQUEST_KEEP_DAYS, max = LINK_MAP_MAX, adding = 1 } = {}) {
  const entries = Object.entries(map || {}).map(([key, v]) => [key, ms(v && typeof v === 'object' ? v.at : v)]);
  const drop = new Set(entries.filter(([, at]) => keepDays > 0 && (!Number.isFinite(at) || now - at > keepDays * DAY)).map(([k]) => k));
  const left = entries.filter(([k]) => !drop.has(k)).sort((a, b) => (a[1] || 0) - (b[1] || 0));
  while (left.length + adding > max && left.length) drop.add(left.shift()[0]);
  return [...drop];
}

/**
 * This app's to-do list for the website (`websiteLink/app.todo`): only what
 * the website can't see for itself, at most ten items, each opening the
 * Website orders tab here.
 */
export function buildAppTodo({ needYou = 0, storageMissing = [], oldStorageBooks = 0, problem = '' } = {}, now = new Date().toISOString()) {
  const items = [];
  const plural = (n, one, many) => (n === 1 ? one : many);
  const n = Math.floor(Number(needYou)) || 0;
  if (n > 0) {
    items.push({ id: 'needs-you', count: n, title: `${n} website ${plural(n, 'order needs', 'orders need')} your decision`, hash: WEBSITE_ORDERS_HASH });
  }
  const missing = (Array.isArray(storageMissing) ? storageMissing : []).filter(b => b && Number(b.count) > 0);
  if (missing.length) {
    const title = missing.length === 1
      ? `${plainText(missing[0].title, 120)} has records only in the old storage`
      : `${missing.length} books have records only in the old storage`;
    items.push({ id: 'storage', count: missing.length, title, hash: WEBSITE_ORDERS_HASH });
  }
  const old = Math.floor(Number(oldStorageBooks)) || 0;
  if (old > 0) {
    items.push({ id: 'old-storage', count: old, title: `${old} ${plural(old, 'book is', 'books are')} still in the inventory app’s old storage`, hash: WEBSITE_ORDERS_HASH });
  }
  if (clean(problem)) {
    items.push({ id: 'link-problem', count: 1, title: 'The inventory app’s link to the website needs a look', hash: WEBSITE_ORDERS_HASH });
  }
  return {
    at: now,
    items: items.slice(0, TODO_MAX_ITEMS).map(i => ({ ...i, title: plainText(i.title) })),
  };
}

/** What a to-do says, without its time: two that say the same need no new write. */
export function todoSignature(todo) {
  const items = todo && Array.isArray(todo.items) ? todo.items : [];
  return JSON.stringify(items.map(i => [i && i.id, i && i.count, i && i.title, i && i.hash]));
}

/**
 * The app screen a hash asks for: 'todo' for `#todo`, 'website-orders' for
 * `#website-orders`, else null (a website order link and everything else are
 * left to their own handlers).
 */
export function parseAppRouteHash(hash) {
  const raw = String(hash || '').trim().replace(/^#/, '').toLowerCase();
  if (raw === 'todo') return 'todo';
  if (raw === 'website-orders') return 'website-orders';
  return null;
}
