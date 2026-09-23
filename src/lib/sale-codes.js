// Short codes for books, and reading a card-reader description.
//
// WHY THIS EXISTS
// A tap on a card reader reaches the app as an amount and whatever the seller
// typed into the payment's description, nothing more. Typing "The Hound of
// Heaven" on a phone while a customer waits does not happen. Typing "HH" does.
// So every book gets a short code — its own if the publisher set one, a
// derived one otherwise — and a description can name several books with a
// count each: "2 ALT, HH" is two copies of one book and one of another.
//
// Pure: no DOM, no ledger, no network.

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'la', 'le', 'les', 'de', 'des', 'du', 'el', 'il']);

const normalize = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function cleanCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function baseCode(title) {
  const words = normalize(title).split(' ').filter(Boolean);
  const significant = words.filter(word => !STOP_WORDS.has(word));
  const pool = significant.length ? significant : words;
  if (!pool.length) return 'BK';
  if (pool.length === 1) return cleanCode(pool[0].slice(0, 3)) || 'BK';
  const initials = pool.map(word => word[0]).join('');
  // Two-word titles get a third letter so "Hound Heaven" is HOH, not a bare
  // two letters that turn up inside ordinary descriptions.
  const code = initials.length >= 3 ? initials.slice(0, 4) : (initials + pool[pool.length - 1].slice(1, 3 - initials.length + 1));
  return cleanCode(code) || 'BK';
}

/**
 * Every book's code: the one set on the book when there is one, a derived one
 * otherwise. Derived codes are handed out in a fixed order (by book id) so the
 * same catalogue always yields the same codes, and a clash gets a number.
 */
export function saleCodes(books = {}) {
  const list = Object.values(books || {}).filter(book => book && book.id)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const taken = new Set();
  const codes = {};
  list.forEach(book => {
    const own = cleanCode(book.saleCode);
    if (own && !taken.has(own)) { codes[book.id] = own; taken.add(own); }
  });
  list.forEach(book => {
    if (codes[book.id]) return;
    const base = baseCode(book.title);
    let code = base;
    let n = 2;
    while (taken.has(code)) code = `${base}${n++}`;
    codes[book.id] = code;
    taken.add(code);
  });
  return codes;
}

/**
 * The books a description names, each with the count written before it.
 *
 * Titles (four letters or more, whole words) and codes are both read. A
 * number directly before a name is its count ("2 ALT", "2x Altrove"); no
 * number means one, marked `stated: false` so the caller can still work the
 * count out from the amount when only one book is named. A book named twice
 * is added up. Returns [] when nothing is named.
 */
export function booksInDescription(text, books = {}) {
  const words = normalize(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const codes = saleCodes(books);
  const names = [];
  Object.values(books || {}).forEach(book => {
    if (!book?.id) return;
    const title = normalize(book.title).split(' ').filter(Boolean);
    if (title.join(' ').length >= 4) names.push({ bookId: book.id, words: title });
    const code = codes[book.id];
    if (code) names.push({ bookId: book.id, words: [code.toLowerCase()] });
  });
  // Longest names first, so "the hound of heaven" is read before "hound".
  names.sort((a, b) => b.words.length - a.words.length);

  const found = new Map();
  const used = new Array(words.length).fill(false);
  for (let i = 0; i < words.length; i++) {
    if (used[i]) continue;
    const hit = names.find(name => name.words.every((w, k) => words[i + k] === w && !used[i + k]));
    if (!hit) continue;
    hit.words.forEach((_, k) => { used[i + k] = true; });
    let qty = 1;
    let stated = false;
    const before = words[i - 1];
    const count = before && before.match(/^(\d{1,2})x?$/);
    if (count && !used[i - 1]) { qty = Number(count[1]); stated = true; used[i - 1] = true; }
    const prev = found.get(hit.bookId);
    found.set(hit.bookId, prev
      ? { bookId: hit.bookId, qty: prev.qty + qty, stated: true }
      : { bookId: hit.bookId, qty, stated });
    i += hit.words.length - 1;
  }
  return [...found.values()].filter(line => line.qty > 0);
}

/**
 * Whether a description's books add up to what was paid.
 *
 * Several books in one payment can only be recorded when their list prices,
 * times the counts written, come to the amount exactly — that is the only
 * check that the description and the money agree. One book with no count
 * written is left to the single-book rule, which works the count out.
 */
export function splitSalePlan(payment = {}, lines = [], books = {}, { bookCurrency = () => '' } = {}) {
  const list = Array.isArray(lines) ? lines : [];
  if (!list.length) return { action: 'review', reason: 'no-book' };
  const currency = String(payment.currency || '').toUpperCase();
  let total = 0;
  for (const line of list) {
    const book = books[line.bookId];
    const price = Number(book?.listPrice);
    if (!(price > 0)) return { action: 'review', reason: 'no-price' };
    const cur = String(bookCurrency(book) || '').toUpperCase();
    if (cur && cur !== currency) return { action: 'review', reason: 'currency' };
    total += price * line.qty;
  }
  if (Math.abs(total - Number(payment.amount || 0)) > 0.01) return { action: 'review', reason: 'amount' };
  return {
    action: 'record',
    lines: list.map(line => ({ bookId: line.bookId, qty: line.qty, price: Number(books[line.bookId].listPrice) })),
  };
}
