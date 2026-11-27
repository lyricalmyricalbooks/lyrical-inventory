// Quick log: turning a sentence ("log a gratuity for the Hound", "sold two
// Altrove at the fair for 25 each", "spent 18 dollars on postage") into entries
// for the publisher to check before anything is saved.
//
// This is the reader that runs on the phone itself, with no AI and no signal:
// the short, repetitive things said at a fair table. A sentence it cannot read
// confidently is handed to the AI reader instead (features/quick-log.js), and
// both produce the same entry shape, so the review card is the same either way.
//
// Book names are read by booksInDescription (sale-codes.js), the same loose
// reading the Stripe matcher uses for "houn", "hond" and "2 hound, alt", and
// with the same caution: a word that could be either of two books names
// neither, and the card asks.
//
// Pure: no DOM, no ledger, no network.

import { booksInDescription } from './sale-codes.js';

/** @typedef {'gratuity'|'sale'|'expense'} QuickLogType */

export const QUICK_LOG_TYPES = ['gratuity', 'sale', 'expense'];
export const SALE_CHANNELS = ['In Person', 'Book Fair', 'Website', 'Other'];

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, single: 1, two: 2, couple: 2, pair: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

const GRATUITY_WORDS = /\b(gratuit(y|ies)|gift(ed|ing|s)?|gave|give|giving|given|comp(ed|s|ing)?|complimentary|freebies?|giveaways?|review cop(y|ies)|free cop(y|ies))\b/;
const SALE_WORDS = /\b(sold|sell(s|ing)?|sales?)\b/;
const EXPENSE_WORDS = /\b(spent|spend(ing)?|paid|pay(ing)?|bought|buy(ing)?|expensed?|costs?|purchased?)\b/;
// Words that start a new entry when they follow "and" or a comma.
const CLAUSE_START = /^(?:log(?:ged)?\s+)?(?:a\s+|an\s+)?(gratuit|gift|gave|give|comp|sold|sell|sale|spent|spend|paid|pay|bought|buy|expense|purchas)/;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const CURRENCY_WORDS = [
  [/\b(us|u\.s\.|american)\s+dollars?\b|\busd\b|\bus\$/, 'USD'],
  [/\beuros?\b|\beur\b|€/, 'EUR'],
  [/\b(pounds?|quid)\b|\bgbp\b|£/, 'GBP'],
  [/\b(canadian\s+dollars?|cad|ca\$)\b/, 'CAD'],
];

/** Words in a spoken sentence → digits: "two" → 2, "twenty five" → 25, "a couple" → 2. */
export function wordsToNumbers(text) {
  let out = ` ${String(text || '').toLowerCase()} `;
  // "twenty five" / "twenty-five" → 25
  out = out.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g,
    (_, tens, ones) => String(NUMBER_WORDS[tens] + NUMBER_WORDS[ones]));
  out = out.replace(/\ba\s+(couple|pair)(\s+of)?\b/g, '2');
  out = out.replace(/\b(one|single|two|couple|pair|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/g,
    w => String(NUMBER_WORDS[w]));
  // "18 dollars 50" / "18 50" stay as said; "18 dollars and 50 cents" → 18.50
  out = out.replace(/\b(\d+)\s+dollars?\s+(?:and\s+)?(\d{1,2})\s+cents?\b/g, (_, d, c) => `${d}.${c.padStart(2, '0')} dollars`);
  return out.replace(/\s+/g, ' ').trim();
}

/** "2026-11-26" for a Date, in local time. */
function iso(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * The day a sentence names — "yesterday", "on Saturday", "last friday",
 * "November 20", "the 20th" — or `today` when it names none. Weekdays and
 * dates without a year are always the most recent one, never a future day:
 * nobody logs a gratuity they have not given yet.
 */
export function readDate(text, today) {
  const t = String(text || '').toLowerCase();
  const base = new Date(`${today}T12:00:00`);
  if (/\byesterday\b/.test(t)) { base.setDate(base.getDate() - 1); return iso(base); }
  if (/\b(today|tonight|this morning|this afternoon)\b/.test(t)) return today;
  const wd = t.match(/\b(?:on|last|this past)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) {
    const want = WEEKDAYS.indexOf(wd[1]);
    let back = (base.getDay() - want + 7) % 7;
    if (back === 0 && /\blast\b/.test(wd[0])) back = 7;
    base.setDate(base.getDate() - back);
    return iso(base);
  }
  const md = t.match(new RegExp(`\\b(${MONTHS.join('|')}|${MONTHS.map(m => m.slice(0, 3)).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`))
    || t.match(new RegExp(`\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)\\s+of\\s+(${MONTHS.join('|')})\\b`));
  if (md) {
    const monthWord = isNaN(Number(md[1])) ? md[1] : md[2];
    const day = Number(isNaN(Number(md[1])) ? md[2] : md[1]);
    const month = MONTHS.findIndex(m => m.startsWith(monthWord.slice(0, 3)));
    if (month >= 0 && day >= 1 && day <= 31) {
      const d = new Date(base.getFullYear(), month, day, 12);
      if (d > base) d.setFullYear(d.getFullYear() - 1);
      return iso(d);
    }
  }
  return today;
}

/** Strip the date words readDate understood, so they are not read as a book or a description. */
function withoutDateWords(text) {
  return String(text || '')
    .replace(new RegExp(`\\b(on\\s+|last\\s+|this past\\s+)?(yesterday|today|tonight|this morning|this afternoon|${WEEKDAYS.join('|')})\\b`, 'g'), ' ')
    .replace(new RegExp(`\\b(on\\s+)?(${MONTHS.join('|')}|${MONTHS.map(m => m.slice(0, 3)).join('|')})\\.?\\s+\\d{1,2}(st|nd|rd|th)?\\b`, 'g'), ' ')
    .replace(new RegExp(`\\b(on\\s+)?(the\\s+)?\\d{1,2}(st|nd|rd|th)\\s+of\\s+(${MONTHS.join('|')})\\b`, 'g'), ' ');
}

/**
 * Money in a clause: "$18", "18 dollars", "18.50", "for 25 each", "at 20 a
 * copy". `each` is true when the amount was said per copy.
 */
export function readMoney(text) {
  const t = String(text || '').toLowerCase();
  const re = /(?:[$€£]\s*(\d+(?:[.,]\d{1,2})?))|(\d+(?:[.,]\d{1,2})?)\s*(?:dollars?|bucks|euros?|pounds?|quid|cad|usd|eur|gbp)\b|(?:\bfor|\bat|\bcost|\bcosts|\bwas)\s+(\d+(?:[.,]\d{1,2})?)\b(?!\s*(?:cop(?:y|ies)|books?|st|nd|rd|th))/;
  const m = t.match(re);
  if (!m) return null;
  const amount = Number(String(m[1] || m[2] || m[3]).replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const after = t.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 16);
  const each = /^\s*(each|apiece|a cop(y|ies)|per cop(y|ies)|per book|a book|a piece)\b/.test(after);
  let currency = '';
  for (const [pattern, code] of CURRENCY_WORDS) if (pattern.test(t)) { currency = code; break; }
  return { amount, each, currency, match: m[0] };
}

/** Which kind of entry a clause is, or '' when it names none. */
export function clauseType(text) {
  const t = String(text || '').toLowerCase();
  if (GRATUITY_WORDS.test(t)) return 'gratuity';
  if (SALE_WORDS.test(t)) return 'sale';
  if (EXPENSE_WORDS.test(t)) return 'expense';
  return '';
}

/**
 * One sentence → its clauses, one per entry. "Gratuity for the Hound and sold
 * two Altrove" is two; "sold two Altrove and a Hound" is one (the "and" joins
 * books, not entries), because what follows it starts no new entry.
 */
export function splitClauses(text) {
  const parts = String(text || '').split(/\s*(?:[;!?\n]+|\.(?=\s|$)|,?\s+then\s+|,?\s+also\s+)\s*/i).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const pieces = part.split(/\s*(?:,\s*and\s+|,\s*|\s+and\s+|\s+plus\s+)\s*/i);
    let current = '';
    for (const piece of pieces) {
      // "…and expense it" asks for the gift to be expensed; it is not an entry.
      const asksToExpense = /^expens(e|ed|ing)?(\s+(it|them|that|those))?$/i.test(piece);
      if (current && !asksToExpense && CLAUSE_START.test(piece.toLowerCase()) && clauseType(piece)) {
        out.push(current);
        current = piece;
      } else {
        current = current ? `${current} and ${piece}` : piece;
      }
    }
    if (current) out.push(current);
  }
  return out.map(s => s.trim()).filter(Boolean);
}

/** The recipient of a gift: "to Sarah at CBC", "for the reviewer at the Star". */
function readRecipient(clause, bookTitles) {
  const m = clause.match(/\bto\s+(.+)$/i);
  if (!m) return '';
  let who = m[1]
    .replace(/\b(from\s+(the\s+)?(author|publisher|artist)('?s)?(\s+(pile|copies|stock|share))?)\b.*$/i, '')
    .replace(/\b(and\s+)?expense(d)?(\s+it|\s+them)?\b.*$/i, '')
    .trim();
  // A book title said after "to" is not a person ("give two to the hound" is unusual, but guard anyway).
  if (bookTitles.some(t => t && who.toLowerCase() === t.toLowerCase())) return '';
  who = who.replace(/[,.\s]+$/, '');
  return who.length > 60 ? who.slice(0, 60) : who;
}

/** What an expense was for, in the words used: "spent 18 dollars on postage at Canada Post" → "postage at Canada Post". */
function readExpenseDescription(clause, money) {
  let t = ` ${clause} `;
  if (money?.match) t = t.replace(money.match, ' ');
  t = t
    .replace(/\b(log(ged)?|add|record|an?|business|expense[sd]?|i|we|just|spent|spend|paid|pay|bought|buy|purchased?|cost|costs|was|it|for it)\b/gi, ' ')
    .replace(/\b(\d+(?:[.,]\d{1,2})?)\s*(dollars?|bucks|euros?|pounds?|quid|cad|usd|eur|gbp|us|canadian|american)?\b/gi, ' ')
    .replace(/[$€£]/g, ' ')
    .replace(/^\s*(on|for|at|to)\s+/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/^(on|for)\s+/i, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Read one sentence into entries.
 *
 * @param {string} text  What was said or typed.
 * @param {object} ctx
 * @param {Record<string, any>} ctx.books   The catalogue, by id.
 * @param {string} ctx.today                 "2026-11-26".
 * @param {string} [ctx.activeBookId]        The book on screen, used when a sale or gift names none.
 * @param {string} [ctx.baseCurrency]        The Tax Centre's currency, for an expense that names none.
 * @param {(desc: string) => string} [ctx.categorize]  An expense description → its category.
 * @returns {{ entries: object[], unread: string[] }}
 *   `unread` holds the clauses that named no entry at all; an entry whose book
 *   or amount could not be read is still returned, with `missing` saying what.
 */
export function readQuickLog(text, ctx = {}) {
  const { books = {}, today, activeBookId = '', baseCurrency = 'CAD', categorize = () => '' } = ctx;
  const entries = [];
  const unread = [];
  const bookTitles = Object.values(books).map(b => b?.title || '');
  for (const raw of splitClauses(text)) {
    const type = clauseType(raw);
    if (!type) { unread.push(raw); continue; }
    const said = wordsToNumbers(raw);
    const date = readDate(said, today);
    const plain = withoutDateWords(said);
    const money = readMoney(plain);

    if (type === 'expense') {
      const description = readExpenseDescription(withoutDateWords(raw), readMoney(withoutDateWords(raw)));
      const entry = {
        type, date,
        amount: money ? money.amount : null,
        currency: money?.currency || baseCurrency,
        description,
        category: categorize(description) || 'Other',
        said: raw,
      };
      entry.missing = [!entry.amount && 'amount', !entry.description && 'description'].filter(Boolean);
      entries.push(entry);
      continue;
    }

    // The money words go before the books are read: "for 25" is not a count of 25.
    const forBooks = money ? plain.replace(money.match, ' ') : plain;
    const found = booksInDescription(forBooks, books);
    const lead = forBooks.match(/\b(\d{1,3})\b/);
    const bookless = !found.length;
    const lines = bookless
      ? [{ bookId: '', qty: lead ? Number(lead[1]) : 1 }]
      // The book reader counts up to 99; a bigger number said for one book is its count.
      : found.map(f => ({ bookId: f.bookId, qty: found.length === 1 && lead && (!f.stated || Number(lead[1]) > 99) ? Number(lead[1]) : f.qty }));

    for (const line of lines) {
      const qty = Math.max(1, Math.min(999, line.qty || 1));
      if (type === 'gratuity') {
        const entry = {
          type, date, bookId: line.bookId, qty,
          pile: /\b(author|artist)('?s)?\b/i.test(plain) ? 'author' : 'publisher',
          recipient: readRecipient(withoutDateWords(raw), bookTitles),
          expense: /\bexpens(e|ed|ing)\b/i.test(plain),
          said: raw,
        };
        entry.missing = entry.bookId ? [] : ['book'];
        entries.push(entry);
      } else {
        // A price said for several copies is the total unless "each" was said;
        // with several books in one breath, a bare price is ambiguous, so each
        // book falls back to its own list price and the card shows it.
        let price = null;
        if (money && lines.length === 1) price = money.each || qty === 1 ? money.amount : Math.round((money.amount / qty) * 100) / 100;
        else if (money && money.each) price = money.amount;
        const channel = /\b(fair|market|festival|table)\b/i.test(plain) ? 'Book Fair'
          : /\b(online|website|web site)\b/i.test(plain) ? 'Website' : 'In Person';
        const payment = /\bcash\b/i.test(plain) ? 'Cash' : /\b(card|credit|debit|tap|square|stripe)\b/i.test(plain) ? 'Card' : '';
        const entry = { type, date, bookId: line.bookId, qty, price, channel, payment, said: raw };
        entry.missing = entry.bookId ? [] : ['book'];
        entries.push(entry);
      }
    }
  }
  // A sale or gift that named no book, with exactly one book on screen and
  // nothing else to go on, is for that book — but it is still flagged, so the
  // card shows which book it picked rather than quietly assuming.
  for (const e of entries) {
    if ((e.type === 'gratuity' || e.type === 'sale') && !e.bookId && activeBookId && Object.hasOwn(books, activeBookId)) {
      e.bookId = activeBookId;
      e.assumedBook = true;
      e.missing = [];
    }
  }
  return { entries, unread };
}

/** Whether the phone's own reading is good enough to show without asking the AI. */
export function readConfidently(result) {
  return !!result && result.entries.length > 0 && result.unread.length === 0
    && result.entries.every(e => !e.missing?.length && !e.assumedBook);
}

/**
 * Copies of a book's gift allowance already given, per pile, from its history.
 * Mirrors the Log Gratuity form's own count (voided gifts don't count).
 */
export function gratuityUsed(hist = []) {
  let publisher = 0, author = 0;
  for (const h of hist || []) {
    if (!h || !h.gratuity || h.voided) continue;
    if (h.gratSource === 'publisher') publisher += h.qty || 0;
    else if (h.gratSource === 'author') author += h.qty || 0;
  }
  return { publisher, author };
}

/**
 * What the card should warn about for one entry, in plain words. Nothing here
 * stops a save except a missing book or amount; the rest is "worth a second
 * look", the same caution the form itself shows.
 *
 * @param {object} entry
 * @param {object} ctx  `{ books, states, today, pendingQty }` — pendingQty is
 *   copies of each book already claimed by earlier rows on the same card.
 * @returns {{ blocking: string[], notes: string[] }}
 */
export function checkQuickLogEntry(entry, { books = {}, states = {}, today = '', pendingQty = {} } = {}) {
  const blocking = [];
  const notes = [];
  if (entry.date && today && entry.date > today) notes.push('This date is in the future.');
  if (entry.type === 'expense') {
    if (!(Number(entry.amount) > 0)) blocking.push('Say or type how much it was.');
    if (!String(entry.description || '').trim()) blocking.push('Say or type what it was for.');
    if (Number(entry.amount) >= 1000) notes.push('That is a large amount. Worth a second look.');
    return { blocking, notes };
  }
  const own = Object.hasOwn(books, String(entry.bookId ?? '')) && Object.hasOwn(states, String(entry.bookId ?? ''));
  const book = own ? books[entry.bookId] : null;
  const s = own ? states[entry.bookId] : null;
  if (!book || !s) { blocking.push('Pick the book.'); return { blocking, notes }; }
  if (entry.assumedBook) notes.push(`No book was named, so this is for ${book.title}, the book on screen.`);
  const qty = Math.max(1, Number(entry.qty) || 1);
  const onHand = (Number(s.stock) || 0) - (pendingQty[entry.bookId] || 0);
  if (qty > onHand) blocking.push(`Only ${Math.max(0, onHand)} ${onHand === 1 ? 'copy' : 'copies'} on hand.`);
  if (entry.type === 'gratuity') {
    const used = gratuityUsed(s.hist);
    const alloc = entry.pile === 'author' ? (Number(book.authorGratuity) || 0) : (Number(book.pubGratuity) || 0);
    const left = alloc - used[entry.pile === 'author' ? 'author' : 'publisher'];
    if (alloc > 0 && qty > left) notes.push(`The ${entry.pile === 'author' ? "author's" : "publisher's"} pile has ${Math.max(0, left)} of ${alloc} left, so this goes over.`);
  } else {
    const list = Number(book.listPrice) || 0;
    const price = entry.price == null ? list : Number(entry.price);
    if (!(price >= 0)) blocking.push('Type a price.');
    else if (list > 0 && (price < list * 0.5 || price > list * 1.5)) notes.push('The price is far from the list price. Worth a second look.');
  }
  return { blocking, notes };
}

/** One line a person can read back: "Gratuity · The Hound of Heaven · 1 copy · publisher's pile". */
export function describeEntry(entry, books = {}, fmtMoney = (n, cur) => `${cur || ''}${Number(n).toFixed(2)}`) {
  const title = books[entry.bookId]?.title || 'Book not picked';
  const copies = n => `${n} ${n === 1 ? 'copy' : 'copies'}`;
  if (entry.type === 'gratuity') {
    return ['Gratuity', title, copies(entry.qty), entry.pile === 'author' ? "author's pile" : "publisher's pile", entry.recipient ? `to ${entry.recipient}` : ''].filter(Boolean).join(' · ');
  }
  if (entry.type === 'sale') {
    const price = entry.price == null ? Number(books[entry.bookId]?.listPrice) || 0 : entry.price;
    return ['Sale', title, copies(entry.qty), `${fmtMoney(price, books[entry.bookId]?.currency)} each`, entry.channel, entry.payment].filter(Boolean).join(' · ');
  }
  return ['Expense', fmtMoney(entry.amount || 0, entry.currency ? `${entry.currency} ` : ''), entry.description, entry.category].filter(Boolean).join(' · ');
}

/**
 * The AI reader's answer → the same entries the phone's reader makes. Anything
 * the AI said that this app cannot use — a book id that isn't in the
 * catalogue, a kind of entry that isn't one of the three — is dropped or left
 * for the card to ask about, never trusted.
 */
export function entriesFromAi(answer, { books = {}, today, baseCurrency = 'CAD', categories = [], categorize = () => '' } = {}) {
  const list = Array.isArray(answer?.entries) ? answer.entries : [];
  const okDate = d => (/^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && String(d) <= today ? String(d) : today);
  const out = [];
  for (const a of list.slice(0, 12)) {
    const type = QUICK_LOG_TYPES.includes(a?.type) ? a.type : '';
    if (!type) continue;
    const date = okDate(a.date);
    if (type === 'expense') {
      const description = String(a.description || '').trim().slice(0, 120);
      const amount = Number(a.amount) > 0 ? Math.round(Number(a.amount) * 100) / 100 : null;
      const category = categories.includes(a.category) ? a.category : (categorize(description) || 'Other');
      const currency = /^[A-Z]{3}$/.test(String(a.currency || '')) ? a.currency : baseCurrency;
      const e = { type, date, amount, currency, description, category, said: '', fromAi: true };
      e.missing = [!amount && 'amount', !description && 'description'].filter(Boolean);
      out.push(e);
      continue;
    }
    const bookId = Object.hasOwn(books, String(a.bookId ?? '')) ? String(a.bookId) : '';
    const qty = Math.max(1, Math.min(999, parseInt(a.qty, 10) || 1));
    if (type === 'gratuity') {
      out.push({ type, date, bookId, qty, pile: a.pile === 'author' ? 'author' : 'publisher', recipient: String(a.recipient || '').trim().slice(0, 60), expense: a.expense === true, said: '', fromAi: true, missing: bookId ? [] : ['book'] });
    } else {
      const price = Number(a.price) >= 0 && a.price !== null && a.price !== undefined && a.price !== '' ? Math.round(Number(a.price) * 100) / 100 : null;
      out.push({ type, date, bookId, qty, price, channel: SALE_CHANNELS.includes(a.channel) ? a.channel : 'In Person', payment: ['Cash', 'Card'].includes(a.payment) ? a.payment : '', said: '', fromAi: true, missing: bookId ? [] : ['book'] });
    }
  }
  return out;
}

/** The JSON shape the AI reader is asked to answer in. */
export const QUICK_LOG_AI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    entries: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: QUICK_LOG_TYPES },
          bookId: { type: 'STRING' },
          qty: { type: 'NUMBER' },
          price: { type: 'NUMBER' },
          channel: { type: 'STRING', enum: SALE_CHANNELS },
          payment: { type: 'STRING', enum: ['Cash', 'Card', ''] },
          pile: { type: 'STRING', enum: ['publisher', 'author'] },
          recipient: { type: 'STRING' },
          expense: { type: 'BOOLEAN' },
          date: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          currency: { type: 'STRING' },
          description: { type: 'STRING' },
          category: { type: 'STRING' },
        },
        required: ['type'],
      },
    },
  },
  required: ['entries'],
};

/** The instructions the AI reader gets: the catalogue, today, and the rules. */
export function quickLogAiPrompt(text, { books = {}, today, categories = [], baseCurrency = 'CAD' } = {}) {
  const catalogue = Object.values(books).filter(b => b?.id).map(b => `- ${b.id}: ${b.title}`).join('\n');
  return [
    'You turn one sentence from a small book publisher into ledger entries for them to check. You never save anything.',
    'Entry types:',
    '- gratuity: copies given away free (gift, comp, review copy). Fields: bookId, qty, pile ("publisher" unless the author\'s copies are meant), recipient (who got it, if said), expense (true only if they asked to expense it), date.',
    '- sale: copies sold in person. Fields: bookId, qty, price (per copy, only if said; if a total for several copies was said, divide it), channel (Book Fair if at a fair or market, Website if online, else In Person), payment (Cash or Card if said), date.',
    '- expense: money the business spent. Fields: amount, currency (3-letter code, only if said; else leave empty), description (short, what it was for), category (one of the list), date.',
    `Today is ${today}. Dates are YYYY-MM-DD and never after today. Leave out anything not said.`,
    'Use only these book ids. If a book cannot be told apart from another, leave bookId empty:',
    catalogue || '(no books)',
    `Expense categories: ${categories.join('; ')}.`,
    `If no currency is said for an expense, it is ${baseCurrency}.`,
    'One entry per book per kind. If the sentence names nothing to log, return no entries.',
    '',
    `Sentence: "${String(text || '').replace(/"/g, "'").slice(0, 600)}"`,
  ].join('\n');
}
