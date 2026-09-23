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

// Articles and joining words in the languages the catalogue is published in.
// They never start a code and never name a book ("Un Fantastico Altrove" is
// Fantastico Altrove, not "Un…").
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for',
  'la', 'le', 'les', 'de', 'des', 'du', 'un', 'une',
  'el', 'los', 'las', 'una', 'uno', 'y',
  'il', 'lo', 'gli', 'i', 'di', 'del', 'della', 'e',
  'der', 'die', 'das', 'ein', 'eine', 'und',
]);

const normalize = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function cleanCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function codeOptions(title) {
  const words = normalize(title).split(' ').filter(Boolean);
  const main = words.filter(word => !STOP_WORDS.has(word));
  const first = (main.length ? main : words)[0] || '';
  // Longer versions of the same start, for when two titles share it.
  return [4, 5, 6].map(n => cleanCode(first.slice(0, n))).filter((code, i, all) => code.length === [4, 5, 6][i] && all.indexOf(code) === i);
}

function baseCode(title) {
  // The first three letters of the title's first real word: what a seller
  // would type anyway ("hou" for The Hound of Heaven, "fan" for Un Fantastico
  // Altrove), so the code and the loose reading agree with each other.
  const words = normalize(title).split(' ').filter(Boolean);
  const main = words.filter(word => !STOP_WORDS.has(word));
  const first = (main.length ? main : words)[0] || '';
  return cleanCode(first.slice(0, 3)) || 'BK';
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
    let code = [base, ...codeOptions(book.title)].find(option => !taken.has(option)) || base;
    let n = 2;
    while (taken.has(code)) code = `${base}${n++}`;
    codes[book.id] = code;
    taken.add(code);
  });
  return codes;
}

// ─── Reading what a seller types at a fair table ──────────────────────────
//
// Nobody types a title carefully with a customer waiting. "thehound", "hound",
// "houn", "hond", "2 hound, alt" and "alt+hound" all have to be read as what
// they obviously mean. So a description is read loosely — joined-up words,
// the start of a word, one or two slips of the finger — but never loosely
// enough to guess between two books: when a fragment could be either of two
// books it is read as neither, and the payment waits for the publisher.
//
// That caution is cheap because the money is the second check. A loosely read
// description is only recorded when the books it names, at their prices, add
// up to exactly what was paid.

/** Words that never name a book on their own. */
const FILLER = new Set([
  ...STOP_WORDS, 'x', 'copy', 'copies', 'book', 'books', 'cp', 'cps', 'pcs', 'pc', 'qty', 'plus', 'with',
]);

/** Shortest fragment read as the start of a title word ("alt" → Altrove, "houn" → Hound). */
const MIN_PREFIX = 3;

/** Edit distance with swapped neighbours counted as one slip ("hnoud"). */
function slips(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows = [];
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array(b.length + 1).fill(0));
    rows[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      rows[i][j] = v;
      if (v < best) best = v;
    }
    if (best > limit) return limit + 1;
  }
  return rows[a.length][b.length];
}

/** How many slips a fragment of this length is allowed. */
function slipAllowance(length) {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

/** Everything a book can be called: its code, its whole title, and its main words. */
function bookNames(books, codes) {
  return Object.values(books || {}).filter(book => book?.id).map(book => {
    const words = normalize(book.title).split(' ').filter(Boolean);
    const main = words.filter(word => !STOP_WORDS.has(word));
    return {
      bookId: book.id,
      code: String(codes[book.id] || '').toLowerCase(),
      whole: [words.join(''), main.join('')].filter(name => name.length >= 3),
      words: main.filter(word => word.length >= MIN_PREFIX),
    };
  });
}

/**
 * How well a fragment of typing names one book, or 0 when it doesn't.
 * Higher is surer: the code or the whole title typed exactly beats a single
 * title word, which beats the start of one, which beats a near-miss.
 */
function nameScore(fragment, name) {
  if (!fragment) return 0;
  if (name.code && fragment === name.code) return 100;
  if (name.whole.includes(fragment)) return 90;
  if (name.words.includes(fragment)) return 80;
  if (fragment.length >= MIN_PREFIX) {
    if (name.whole.some(whole => whole.startsWith(fragment))) return 70;
    if (name.words.some(word => word.startsWith(fragment))) return 70;
  }
  const allowance = slipAllowance(fragment.length);
  if (allowance) {
    // A short fragment only gets its slip when it starts with the right
    // letter — "hond" for hound, but not "bond" or "fond".
    const candidates = [...name.whole, ...name.words]
      .filter(candidate => fragment.length >= 6 || candidate[0] === fragment[0]);
    if (candidates.some(candidate => slips(fragment, candidate, allowance) <= allowance)) return 60;
    // A slip in the part typed so far: "hoin" for the start of "hound".
    if (candidates.some(candidate => candidate.length > fragment.length
      && slips(fragment, candidate.slice(0, fragment.length), allowance) <= allowance)) return 50;
  }
  return 0;
}

/** The one book a fragment names, or '' when none — or when two books fit equally well. */
function resolveFragment(fragment, names) {
  let best = 0;
  let hits = new Set();
  names.forEach(name => {
    const score = nameScore(fragment, name);
    if (!score || score < best) return;
    if (score > best) { best = score; hits = new Set(); }
    hits.add(name.bookId);
  });
  return hits.size === 1 ? [...hits][0] : '';
}

/**
 * Split typing into pieces: counts, separators and words. "2x", "x2", "×2"
 * and a bare "2" are counts; commas, plus signs, ampersands, slashes and
 * "and" separate books.
 */
function tokens(text) {
  const raw = String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/×/g, 'x');
  const out = [];
  const re = /(\d{1,2})\s*x\b|\bx\s*(\d{1,2})\b|(\d{1,2})|([a-z]+)|([,+&;/|\n])/g;
  let m;
  while ((m = re.exec(raw))) {
    if (m[1] || m[3]) out.push({ type: 'count', qty: Number(m[1] || m[3]), after: false });
    else if (m[2]) out.push({ type: 'count', qty: Number(m[2]), after: true });
    else if (m[4] === 'and') out.push({ type: 'sep' });
    else if (m[4]) out.push({ type: 'word', word: m[4] });
    else out.push({ type: 'sep' });
  }
  return out;
}

/**
 * The books a description names, each with the count written beside it.
 *
 * Read loosely, for typing done in a hurry: "thehound", "hound", "houn" and
 * "hond" all find The Hound; "2 alt, hound x3" is two of one and three of
 * another. A count before a name ("2 alt", "2x alt") or straight after it
 * ("alt x2") belongs to that name; no count means one, marked
 * `stated: false` so the caller can work the count out from the amount when
 * only one book is named. A book named twice is added up. Words that fit no
 * book, or fit two books equally, are skipped.
 */
export function booksInDescription(text, books = {}) {
  const names = bookNames(books, saleCodes(books));
  if (!names.length) return [];
  const toks = tokens(text);
  const found = new Map();
  let pending = null;

  const add = (bookId, qty, stated) => {
    const prev = found.get(bookId);
    found.set(bookId, prev
      ? { bookId, qty: prev.qty + qty, stated: true }
      : { bookId, qty, stated });
  };

  let i = 0;
  while (i < toks.length) {
    const tok = toks[i];
    if (tok.type === 'sep') { pending = null; i++; continue; }
    if (tok.type === 'count') { if (!tok.after) pending = tok.qty; i++; continue; }

    // The longest run of words (up to five) that names one book: "the hound
    // of heaven" is read whole before "hound" is tried on its own.
    let matched = null;
    for (let len = Math.min(5, toks.length - i); len >= 1 && !matched; len--) {
      const run = toks.slice(i, i + len);
      if (run.some(t => t.type !== 'word')) continue;
      const words = run.map(t => t.word);
      if (words.every(word => FILLER.has(word))) continue;
      const joined = words.join('');
      const trimmed = words.filter(word => !FILLER.has(word)).join('');
      const bookId = resolveFragment(joined, names) || (trimmed !== joined ? resolveFragment(trimmed, names) : '');
      if (bookId) matched = { bookId, len };
    }
    if (!matched) { i++; continue; }

    let qty = 1;
    let stated = false;
    if (pending) { qty = pending; stated = true; pending = null; }
    const next = toks[i + matched.len];
    if (!stated && next?.type === 'count' && next.after) { qty = next.qty; stated = true; i++; }
    if (qty > 0) add(matched.bookId, qty, stated);
    i += matched.len;
  }
  return [...found.values()];
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
